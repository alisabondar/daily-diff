import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, sources } from '../db/schema.js';
import { fetchHn } from '../sources/hn.js';
import { fetchRss } from '../sources/rss.js';
import type { RawItem } from '../sources/types.js';
import { mapLimit } from './concurrency.js';

export type Digest = typeof digests.$inferSelect;
export interface IngestDeps { fetchFn?: typeof fetch; now: () => Date }

/** Fetches every enabled source (concurrency 8), recording per-source health and failures on the digest. */
export async function runS1(db: Db, digest: Digest, { fetchFn, now }: IngestDeps): Promise<RawItem[]> {
  db.update(digests).set({ failedSourceIds: [] }).where(eq(digests.id, digest.id)).run();
  const enabled = db.select().from(sources).where(eq(sources.enabled, true)).all();
  const failed: number[] = [];
  const results = await mapLimit(enabled, 8, async (source) => {
    try {
      const fetcher = source.kind === 'hn' ? fetchHn : fetchRss;
      const raw = await fetcher(source, digest.windowStart, { fetchFn });
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'ok', lastError: null }).where(eq(sources.id, source.id)).run();
      return raw;
    } catch (err) {
      failed.push(source.id);
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'error', lastError: (err as Error).message }).where(eq(sources.id, source.id)).run();
      return [];
    }
  });
  db.update(digests).set({ failedSourceIds: failed.sort((a, b) => a - b) }).where(eq(digests.id, digest.id)).run();
  return results.flat();
}
