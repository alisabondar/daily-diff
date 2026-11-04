import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digestEntries, digests, learnItems, moreSectionFor, sources, stories, storyItems, type ErrorCode } from '../db/schema.js';
import { CATEGORY_FOR_SOURCE } from './s4-score.js';
import type { Digest } from './s1-fetch.js';
import { windowItems } from './s2-store.js';

/** Fallback when S3–S7 fail: one story per window item, all in More, newest first. No learn items. */
export function buildRaw(db: Db, digest: Digest, error: { code: Exclude<ErrorCode, 'unknown'>; message: string }, now: () => Date, startedAt: number): void {
  const types = new Map(db.select({ id: sources.id, type: sources.type }).from(sources).all().map((s) => [s.id, s.type]));
  const items = windowItems(db, digest).sort((a, b) => b.publishedAt - a.publishedAt);
  const completedAt = now().getTime();
  db.transaction((tx) => {
    tx.delete(digestEntries).where(eq(digestEntries.digestId, digest.id)).run();
    tx.delete(learnItems).where(eq(learnItems.digestId, digest.id)).run();
    tx.delete(stories).where(eq(stories.digestId, digest.id)).run();
    const positions = new Map<string, number>();
    for (const item of items) {
      const category = CATEGORY_FOR_SOURCE[types.get(item.sourceId) ?? 'news'];
      const { id } = tx.insert(stories).values({ digestId: digest.id, title: item.title, summary: item.excerpt, category, topic: 'other' }).returning({ id: stories.id }).get();
      tx.insert(storyItems).values({ storyId: id, itemId: item.id }).run();
      const section = moreSectionFor(category);
      const position = positions.get(section) ?? 0;
      positions.set(section, position + 1);
      tx.insert(digestEntries).values({ digestId: digest.id, storyId: id, tab: 'more', section, position }).run();
    }
    tx.update(digests)
      .set({ isRaw: true, status: 'done', stage: 8, errorCode: error.code, errorMessage: error.message, completedAt, durationMs: Math.max(0, completedAt - startedAt) })
      .where(eq(digests.id, digest.id))
      .run();
  });
}

