import { eq } from 'drizzle-orm';
import { stories, type Category, type SourceType, type Topic } from '../db/schema.js';
import { ScoreSchema, scorePrompt, scoreSystem } from '../prompts/score.js';
import { callLlm, finishStage, loadStories, newUsage, type StageCtx } from './context.js';

export const SCORE_BATCH = 50;

export const CATEGORY_FOR_SOURCE: Record<SourceType, Category> = {
  news: 'headline', blog: 'long-read', podcast: 'podcast', video: 'video', community: 'headline',
};

const clamp = (n: number) => Math.min(10, Math.max(0, Math.round(n)));

/** S4: scores relevance 0–10 and assigns a category and topic (fast tier, batches of 50). */
export async function runS4(ctx: StageCtx): Promise<void> {
  const { db, digest, config } = ctx;
  const all = loadStories(db, digest.id);
  const usage = newUsage();
  const results = new Map<number, { score: number; category: Category; topic: Topic }>();
  for (let i = 0; i < all.length; i += SCORE_BATCH) {
    const batch = all.slice(i, i + SCORE_BATCH);
    const out = await callLlm(ctx, { tier: 'fast', task: 'score', system: scoreSystem(config.profile), prompt: scorePrompt(batch), schema: ScoreSchema }, usage);
    for (const s of out.scores) results.set(s.storyId, { score: clamp(s.score), category: s.category, topic: s.topic ?? 'other' });
  }
  db.transaction((tx) => {
    for (const s of all) {
      const r = results.get(s.id) ?? { score: 0, category: CATEGORY_FOR_SOURCE[s.items[0]?.source.type ?? 'news'], topic: 'other' as const };
      tx.update(stories).set(r).where(eq(stories.id, s.id)).run();
    }
    finishStage(tx, digest.id, 4, usage);
  });
}
