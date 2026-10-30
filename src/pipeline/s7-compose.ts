import { and, eq, gte, isNotNull, ne } from 'drizzle-orm';
import { digestEntries, digests, HIGHLIGHT_SECTION_FOR, learnItems, moreSectionFor } from '../db/schema.js';
import { loadBooks } from '../packs/index.js';
import { ComposeSchema, composePrompt, composeSystem, type ComposeOutput } from '../prompts/compose.js';
import { DOCS_WARNING, QUICKSTART_SYSTEM, QuickstartSchema, quickstartPrompt } from '../prompts/quickstart.js';
import { fetchWithTimeout, isSafePublicUrl, stripHtml, truncate } from '../sources/text.js';
import { callLlm, finishStage, loadStories, newUsage, type StageCtx, type StoryWithItems } from './context.js';

const CATCHUP_CAP = 15;
const MAX_WATCH = 2;
const RECENT_DAYS = 30;
const DOCS_CAP = 8000;

/** Derives the raw README URL from the first github.com/<owner>/<repo> URL, if any. */
export function githubReadmeUrl(urls: string[]): string | null {
  for (const u of urls) {
    const m = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/i.exec(u);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]!.replace(/\.git$/, '')}/HEAD/README.md`;
  }
  return null;
}

function recentConceptKeys(ctx: StageCtx): string[] {
  const since = ctx.digest.windowEnd - RECENT_DAYS * 24 * 3600_000;
  return ctx.db
    .selectDistinct({ key: learnItems.conceptKey })
    .from(learnItems)
    .innerJoin(digests, eq(digests.id, learnItems.digestId))
    .where(and(eq(learnItems.type, 'concept'), isNotNull(learnItems.conceptKey), ne(digests.id, ctx.digest.id), gte(digests.createdAt, since)))
    .all()
    .map((r) => r.key!);
}

function validHighlights(out: ComposeOutput, byId: Map<number, StoryWithItems>, cap: number) {
  const seen = new Set<number>();
  let watch = 0;
  const kept: { storyId: number; section: string }[] = [];
  for (const h of out.highlights) {
    const story = byId.get(h.storyId);
    if (!story || seen.has(h.storyId) || !story.category || HIGHLIGHT_SECTION_FOR[story.category] !== h.section) continue;
    if (h.section === 'watch' && ++watch > MAX_WATCH) continue;
    seen.add(h.storyId);
    kept.push(h);
  }
  return kept.slice(0, cap);
}

async function fetchDocs(target: StoryWithItems, docsUrl: string | null, fetchFn?: typeof fetch): Promise<{ text: string; unavailable: boolean }> {
  const readme = githubReadmeUrl(target.items.map((i) => i.url));
  const url = readme ?? (docsUrl && isSafePublicUrl(docsUrl) ? docsUrl : null);
  if (url) {
    try {
      const body = await (await fetchWithTimeout(url, { fetchFn, timeoutMs: 10_000 })).text();
      const text = truncate(readme ? body : stripHtml(body), DOCS_CAP);
      if (text) return { text, unavailable: false };
    } catch {
      // fall through to the announcement text
    }
  }
  return { text: truncate(target.items.map((i) => i.content).join('\n\n'), DOCS_CAP), unavailable: true };
}

/** S7: Call A (strong) picks Highlights + concept + quick-start target; Call B (strong) writes the quick start. */
export async function runS7(ctx: StageCtx): Promise<void> {
  const { db, digest, config } = ctx;
  const summarized = loadStories(db, digest.id).filter((s) => s.summary !== null);
  const usage = newUsage();

  if (summarized.length === 0) {
    db.transaction((tx) => {
      tx.delete(digestEntries).where(eq(digestEntries.digestId, digest.id)).run();
      tx.delete(learnItems).where(eq(learnItems.digestId, digest.id)).run();
      finishStage(tx, digest.id, 7, usage);
    });
    return;
  }

  const byId = new Map(summarized.map((s) => [s.id, s]));
  const cap = digest.kind === 'catchup' ? CATCHUP_CAP : config.highlightsCap;
  const recent = recentConceptKeys(ctx);
  const input = {
    stories: summarized.map(({ id, title, category, score, summary }) => ({ id, title, category, score, summary })),
    recentConceptKeys: recent,
    books: loadBooks(),
  };
  const callA = (forbiddenKeys?: string[]) =>
    callLlm(ctx, { tier: 'strong', task: 'compose', system: composeSystem(config.profile, cap), prompt: composePrompt({ ...input, forbiddenKeys }), schema: ComposeSchema }, usage);

  let out = await callA();
  if (recent.includes(out.concept.conceptKey)) out = await callA(recent);

  const highlights = validHighlights(out, byId, cap);
  const allStoryIds = new Set(loadStories(db, digest.id).map((s) => s.id));
  const relatedStoryId = allStoryIds.has(out.concept.relatedStoryId) ? out.concept.relatedStoryId : null;

  let target = byId.get(out.quickstartTarget.storyId);
  let docsUrl = out.quickstartTarget.docsUrl;
  if (!target) {
    const byScore = [...summarized].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    target = byScore.find((s) => s.category === 'tool') ?? byScore[0]!;
    docsUrl = null;
  }
  const docs = await fetchDocs(target, docsUrl, ctx.fetchFn);
  const qs = await callLlm(ctx, {
    tier: 'strong', task: 'quickstart', system: QUICKSTART_SYSTEM, schema: QuickstartSchema,
    prompt: quickstartPrompt({ name: out.quickstartTarget.name, storyTitle: target.title, docsUrl, docsText: docs.text, docsUnavailable: docs.unavailable }),
  }, usage);
  const qsBody = docs.unavailable && !qs.bodyMd.startsWith(DOCS_WARNING) ? `${DOCS_WARNING}\n\n${qs.bodyMd}` : qs.bodyMd;

  const highlighted = new Set(highlights.map((h) => h.storyId));
  const more = summarized.filter((s) => !highlighted.has(s.id)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const positions = new Map<string, number>();
  const nextPos = (key: string) => {
    const n = positions.get(key) ?? 0;
    positions.set(key, n + 1);
    return n;
  };

  db.transaction((tx) => {
    tx.delete(digestEntries).where(eq(digestEntries.digestId, digest.id)).run();
    tx.delete(learnItems).where(eq(learnItems.digestId, digest.id)).run();
    const rows = [
      ...highlights.map((h) => ({ digestId: digest.id, storyId: h.storyId, tab: 'highlights' as const, section: h.section, position: nextPos(`h:${h.section}`) })),
      ...more.map((s) => {
        const section = moreSectionFor(s.category);
        return { digestId: digest.id, storyId: s.id, tab: 'more' as const, section, position: nextPos(`m:${section}`) };
      }),
    ];
    if (rows.length) tx.insert(digestEntries).values(rows).run();
    const c = out.concept;
    tx.insert(learnItems).values([
      { digestId: digest.id, type: 'concept', conceptKey: c.conceptKey, title: c.title, bodyMd: c.bodyMd, quiz: c.quiz, relatedStoryId, sourceRef: c.sourceRef },
      { digestId: digest.id, type: 'quickstart', conceptKey: null, title: qs.title, bodyMd: qsBody, quiz: null, relatedStoryId: target.id, sourceRef: qs.sourceRef },
    ]).run();
    finishStage(tx, digest.id, 7, usage);
  });
}
