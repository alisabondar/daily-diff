import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, sources } from '../db/schema.js';
import { fetchHn } from '../sources/hn.js';
import { fetchRss, isRedditFeed } from '../sources/rss.js';
import type { RawItem } from '../sources/types.js';
import { mapLimit } from './concurrency.js';

export type Digest = typeof digests.$inferSelect;
export interface IngestDeps { fetchFn?: typeof fetch; now: () => Date; sleep?: (ms: number) => Promise<void> }

// Reddit rate-limits parallel feed requests: fetch its feeds one at a time, and retry a 429 once.
const REDDIT_GAP_MS = 2000;
const REDDIT_RETRY_MS = 5000;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetches every enabled source (concurrency 8; Reddit feeds sequentially), recording per-source health and failures on the digest. */
export async function runS1(db: Db, digest: Digest, { fetchFn, now, sleep = realSleep }: IngestDeps): Promise<RawItem[]> {
  db.update(digests).set({ failedSourceIds: [] }).where(eq(digests.id, digest.id)).run();
  const enabled = db.select().from(sources).where(eq(sources.enabled, true)).all();
  const failed: number[] = [];
  const isReddit = (s: (typeof enabled)[number]) => s.kind === 'rss' && isRedditFeed(s.feedUrl);
  const fetchOne = async (source: (typeof enabled)[number]): Promise<RawItem[]> => {
    try {
      const fetcher = source.kind === 'hn' ? fetchHn : fetchRss;
      let raw: RawItem[];
      try {
        raw = await fetcher(source, digest.windowStart, { fetchFn });
      } catch (err) {
        if (!isReddit(source) || !/HTTP 429/.test((err as Error).message)) throw err;
        await sleep(REDDIT_RETRY_MS);
        raw = await fetcher(source, digest.windowStart, { fetchFn });
      }
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'ok', lastError: null }).where(eq(sources.id, source.id)).run();
      return raw;
    } catch (err) {
      failed.push(source.id);
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'error', lastError: (err as Error).message }).where(eq(sources.id, source.id)).run();
      return [];
    }
  };
  const redditInOrder = async () => {
    const out: RawItem[][] = [];
    for (const [i, source] of enabled.filter(isReddit).entries()) {
      if (i > 0) await sleep(REDDIT_GAP_MS);
      out.push(await fetchOne(source));
    }
    return out;
  };
  const [rest, reddit] = await Promise.all([mapLimit(enabled.filter((s) => !isReddit(s)), 8, fetchOne), redditInOrder()]);
  const results = [...rest, ...reddit];
  db.update(digests).set({ failedSourceIds: failed.sort((a, b) => a - b) }).where(eq(digests.id, digest.id)).run();
  return results.flat();
}
