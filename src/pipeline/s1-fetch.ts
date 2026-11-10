import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, sources } from '../db/schema.js';
import { fetchHn } from '../sources/hn.js';
import { fetchRss, isRedditFeed } from '../sources/rss.js';
import { fetchYoutubeApi, youtubeChannelId } from '../sources/youtube-api.js';
import type { RawItem } from '../sources/types.js';
import { mapLimit } from './concurrency.js';

export type Digest = typeof digests.$inferSelect;
/** youtubeApiKey: when set, YouTube channel feeds go through the Data API instead of RSS. */
export interface IngestDeps { fetchFn?: typeof fetch; now: () => Date; sleep?: (ms: number) => Promise<void>; youtubeApiKey?: string }

// Reddit rate-limits parallel feed requests: fetch its feeds one at a time, and retry a 429 once.
// YouTube's feed server intermittently answers 404/5xx for valid channels: fetch one at a time, and retry twice.
type Lane = { gapMs: number; retryMs: number; retries: number; retryOn: RegExp };
const REDDIT: Lane = { gapMs: 2000, retryMs: 5000, retries: 1, retryOn: /HTTP 429/ };
const YOUTUBE: Lane = { gapMs: 1000, retryMs: 3000, retries: 2, retryOn: /HTTP (404|5\d\d)/ };
const isYoutubeFeed = (feedUrl: string) => /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?/.test(feedUrl);
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetches every enabled source (concurrency 8; Reddit and YouTube feeds sequentially, with retries), recording per-source health and failures on the digest. */
export async function runS1(db: Db, digest: Digest, { fetchFn, now, sleep = realSleep, youtubeApiKey }: IngestDeps): Promise<RawItem[]> {
  db.update(digests).set({ failedSourceIds: [] }).where(eq(digests.id, digest.id)).run();
  const enabled = db.select().from(sources).where(eq(sources.enabled, true)).all();
  const failed: number[] = [];
  type Src = (typeof enabled)[number];
  const viaApi = (s: Src) => !!youtubeApiKey && s.kind === 'rss' && youtubeChannelId(s.feedUrl) !== null;
  const laneOf = (s: Src): Lane | null => (s.kind !== 'rss' || viaApi(s) ? null : isRedditFeed(s.feedUrl) ? REDDIT : isYoutubeFeed(s.feedUrl) ? YOUTUBE : null);
  const fetchOne = async (source: Src): Promise<RawItem[]> => {
    try {
      const fetcher = source.kind === 'hn' ? fetchHn : fetchRss;
      const lane = laneOf(source);
      let raw: RawItem[];
      for (let attempt = 0; ; attempt++) {
        try {
          raw = viaApi(source)
            ? await fetchYoutubeApi(source, digest.windowStart, { fetchFn, apiKey: youtubeApiKey! })
            : await fetcher(source, digest.windowStart, { fetchFn });
          break;
        } catch (err) {
          if (!lane || attempt >= lane.retries || !lane.retryOn.test((err as Error).message)) throw err;
          await sleep(lane.retryMs);
        }
      }
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'ok', lastError: null }).where(eq(sources.id, source.id)).run();
      return raw;
    } catch (err) {
      failed.push(source.id);
      db.update(sources).set({ lastFetchedAt: now().getTime(), lastStatus: 'error', lastError: (err as Error).message }).where(eq(sources.id, source.id)).run();
      return [];
    }
  };
  const inOrder = async (lane: Lane) => {
    const out: RawItem[][] = [];
    for (const [i, source] of enabled.filter((s) => laneOf(s) === lane).entries()) {
      if (i > 0) await sleep(lane.gapMs);
      out.push(await fetchOne(source));
    }
    return out;
  };
  const [rest, reddit, youtube] = await Promise.all([mapLimit(enabled.filter((s) => !laneOf(s)), 8, fetchOne), inOrder(REDDIT), inOrder(YOUTUBE)]);
  const results = [...rest, ...reddit, ...youtube];
  db.update(digests).set({ failedSourceIds: failed.sort((a, b) => a - b) }).where(eq(digests.id, digest.id)).run();
  return results.flat();
}
