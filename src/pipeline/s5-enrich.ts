import { eq } from 'drizzle-orm';
import { stories } from '../db/schema.js';
import { hnComments, hnSearchByUrl } from '../sources/hn.js';
import { redditComments } from '../sources/reddit.js';
import { truncate } from '../sources/text.js';
import { VERSION } from '../version.js';
import { mapLimit } from './concurrency.js';
import { finishStage, loadStories, newUsage, type StageCtx, type StoryWithItems } from './context.js';

const TOP_OTHERS = 15;
const isReddit = (u: string | null) => !!u && /(^|\.)reddit\.com$/.test(new URL(u).hostname);

async function hnText(story: StoryWithItems, fetchFn?: typeof fetch): Promise<string | null> {
  try {
    let hnId = story.items.find((i) => i.hnId !== null)?.hnId ?? null;
    if (hnId === null && story.category === 'model' && story.items[0]) hnId = await hnSearchByUrl(story.items[0].url, { fetchFn });
    return hnId === null ? null : (await hnComments(hnId, { fetchFn })) || null;
  } catch {
    return null; // network failures never fail the stage
  }
}

/** S5: attaches HN (and best-effort Reddit) discussion text to model stories and the top relevant others. No LLM. */
export async function runS5(ctx: StageCtx): Promise<void> {
  const { db, digest, config, fetchFn } = ctx;
  const all = loadStories(db, digest.id);
  const others = all
    .filter((s) => s.category !== 'model' && (s.score ?? 0) >= config.relevanceThreshold)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, TOP_OTHERS);
  const targets = [...all.filter((s) => s.category === 'model'), ...others];

  const texts = await mapLimit(targets, 4, async (story) => {
    const parts = [await hnText(story, fetchFn)];
    const thread = story.items.find((i) => isReddit(i.discussionUrl))?.discussionUrl;
    if (thread) parts.push(await redditComments(thread, { fetchFn, version: VERSION }));
    const joined = parts.filter(Boolean).join('\n---\n');
    return joined ? truncate(joined, 6000) : null;
  });

  db.transaction((tx) => {
    targets.forEach((s, i) => tx.update(stories).set({ community: texts[i] }).where(eq(stories.id, s.id)).run());
    finishStage(tx, digest.id, 5, newUsage());
  });
}
