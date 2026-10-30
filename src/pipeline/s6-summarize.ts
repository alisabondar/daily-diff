import { eq } from 'drizzle-orm';
import { stories, type Stat } from '../db/schema.js';
import { SummarySchema, summarizePrompt, summarizeSystem, type SummaryOutput } from '../prompts/summarize.js';
import { mapLimit } from './concurrency.js';
import { callLlm, finishStage, loadStories, newUsage, type StageCtx, type StoryWithItems } from './context.js';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Applies the stats guard and the model-only / community-only rules. */
export function guardSummary(story: StoryWithItems, out: SummaryOutput): { summary: string; stats: Stat[] | null; pros: string[] | null; cons: string[] | null } {
  if (story.category !== 'model') return { summary: out.summary, stats: null, pros: null, cons: null };
  const contentByUrl = new Map(story.items.map((i) => [i.url, norm(i.content)]));
  const stats = (out.stats ?? []).filter((s) => {
    const content = contentByUrl.get(s.sourceUrl);
    const value = norm(s.value);
    return content !== undefined && value !== '' && content.includes(value);
  });
  const hasCommunity = !!story.community?.trim();
  return {
    summary: out.summary,
    stats,
    pros: hasCommunity ? (out.pros ?? []).slice(0, 3) : null,
    cons: hasCommunity ? (out.cons ?? []).slice(0, 3) : null,
  };
}

/** S6: one fast-tier summary per story at or above the relevance threshold (concurrency 5). */
export async function runS6(ctx: StageCtx): Promise<void> {
  const { db, digest, config } = ctx;
  const targets = loadStories(db, digest.id).filter((s) => (s.score ?? 0) >= config.relevanceThreshold);
  const usage = newUsage();
  const results = await mapLimit(targets, 5, async (story) => {
    const out = await callLlm(ctx, {
      tier: 'fast', task: 'summarize', system: summarizeSystem(story.category === 'model'), prompt: summarizePrompt(story), schema: SummarySchema,
    }, usage);
    return guardSummary(story, out);
  });
  db.transaction((tx) => {
    targets.forEach((s, i) => tx.update(stories).set(results[i]!).where(eq(stories.id, s.id)).run());
    finishStage(tx, digest.id, 6, usage);
  });
}
