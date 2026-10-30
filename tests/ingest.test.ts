import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { digests, items, sources } from '../src/db/schema.js';
import { runS1, type Digest } from '../src/pipeline/s1-fetch.js';
import { runS2, windowItems } from '../src/pipeline/s2-store.js';
import { computeWindow } from '../src/time.js';
import { fakeFetch, fixture } from './helpers.js';

const H = 3600_000;
const DAY = 24 * H;
const now = new Date('2026-10-29T08:00:00Z');
const t = now.getTime();

test('window: first run covers the last 24h', () => {
  expect(computeWindow(null, now)).toEqual({ windowStart: t - DAY, windowEnd: t, kind: 'daily' });
});

test('window: a normal day starts at the previous windowEnd', () => {
  expect(computeWindow({ windowEnd: t - 23 * H }, now)).toEqual({ windowStart: t - 23 * H, windowEnd: t, kind: 'daily' });
});

test('window: a 3-day gap is a catchup', () => {
  expect(computeWindow({ windowEnd: t - 3 * DAY }, now)).toEqual({ windowStart: t - 3 * DAY, windowEnd: t, kind: 'catchup' });
});

test('window: a 30-day gap is clamped to 7 days', () => {
  expect(computeWindow({ windowEnd: t - 30 * DAY }, now)).toEqual({ windowStart: t - 7 * DAY, windowEnd: t, kind: 'catchup' });
});

let db: Db;
beforeEach(() => {
  db = openDb(join(mkdtempSync(join(tmpdir(), 'dd-')), 'test.db'));
  runMigrations(db);
});

function addSource(feedUrl: string, over: Partial<typeof sources.$inferInsert> = {}) {
  return db.insert(sources).values({ kind: 'rss', type: 'blog', title: feedUrl, url: feedUrl, feedUrl, ...over }).returning().get();
}

function addDigest(date: string, w: { windowStart: number; windowEnd: number }): Digest {
  return db.insert(digests).values({ date, kind: 'daily', status: 'running', ...w }).returning().get();
}

const reload = (d: Digest) => db.select().from(digests).where(eq(digests.id, d.id)).get()!;

async function ingest(digest: Digest, fetchFn: typeof fetch, at: Date) {
  const raw = await runS1(db, digest, { fetchFn, now: () => at });
  runS2(db, reload(digest), raw, () => at);
}

const hnHit = JSON.stringify({ hits: [{ objectID: '777', title: 'Shipping & scaling', url: 'https://blog.example.com/posts/shipping/', author: 'x', created_at_i: t / 1000, story_text: null }] });

test('one source fails, one succeeds: failure recorded, items stored', async () => {
  const ok = addSource('https://ok.dev/feed');
  const bad = addSource('https://bad.dev/feed');
  addSource('https://off.dev/feed', { enabled: false });
  const d = addDigest('2026-10-29', computeWindow(null, now));
  await ingest(d, fakeFetch({ 'https://ok.dev/feed': fixture('feeds/blog-rss2.xml'), 'https://bad.dev/feed': 500 }), now);
  const after = reload(d);
  expect(after.failedSourceIds).toEqual([bad.id]);
  expect(after.stage).toBe(2);
  expect(after.windowEnd).toBe(t);
  const okRow = db.select().from(sources).where(eq(sources.id, ok.id)).get()!;
  const badRow = db.select().from(sources).where(eq(sources.id, bad.id)).get()!;
  expect(okRow).toMatchObject({ lastStatus: 'ok', lastError: null, lastFetchedAt: t });
  expect(badRow).toMatchObject({ lastStatus: 'error', lastFetchedAt: t });
  expect(badRow.lastError).toMatch(/500/);
  expect(db.select().from(items).all().map((i) => i.url).sort()).toEqual([
    'https://blog.example.com/posts/shipping', 'https://blog.example.com/posts/undated',
  ]);
});

test('undated items fall back to fetchedAt for publishedAt', async () => {
  addSource('https://ok.dev/feed');
  const d = addDigest('2026-10-29', computeWindow(null, now));
  await ingest(d, fakeFetch({ 'https://ok.dev/feed': fixture('feeds/blog-rss2.xml') }), now);
  expect(db.select().from(items).where(eq(items.url, 'https://blog.example.com/posts/undated')).get()!.publishedAt).toBe(t);
});

test('same URL from a blog and HN gives one row with discussionUrl set', async () => {
  addSource('https://ok.dev/feed');
  addSource('hn:front_page', { kind: 'hn', type: 'community', hnTags: 'front_page' });
  const d = addDigest('2026-10-29', computeWindow(null, now));
  await ingest(d, fakeFetch({ 'https://ok.dev/feed': fixture('feeds/blog-rss2.xml'), 'https://hn.algolia.com/*': hnHit }), now);
  const rows = db.select().from(items).where(eq(items.url, 'https://blog.example.com/posts/shipping')).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ discussionUrl: 'https://news.ycombinator.com/item?id=777', hnId: 777 });
});

test('re-running S1–S2 does not duplicate items', async () => {
  addSource('https://ok.dev/feed');
  const d = addDigest('2026-10-29', computeWindow(null, now));
  const f = fakeFetch({ 'https://ok.dev/feed': fixture('feeds/blog-rss2.xml') });
  await ingest(d, f, now);
  await ingest(d, f, new Date(t + 60_000));
  expect(db.select().from(items).all()).toHaveLength(2);
});

test("an item first seen yesterday is not in today's window", async () => {
  addSource('https://ok.dev/feed');
  const f = fakeFetch({ 'https://ok.dev/feed': fixture('feeds/blog-rss2.xml') });
  const yesterday = new Date(t - DAY);
  const d1 = addDigest('2026-10-28', computeWindow(null, yesterday));
  await ingest(d1, f, yesterday);
  expect(windowItems(db, reload(d1))).toHaveLength(2);
  const d2 = addDigest('2026-10-29', computeWindow(reload(d1), now));
  await ingest(d2, f, now);
  expect(windowItems(db, reload(d2))).toEqual([]);
});

test('re-running S1 resets failedSourceIds', async () => {
  addSource('https://flaky.dev/feed');
  const d = addDigest('2026-10-29', computeWindow(null, now));
  await ingest(d, fakeFetch({ 'https://flaky.dev/feed': 500 }), now);
  expect(reload(d).failedSourceIds).toHaveLength(1);
  await ingest(d, fakeFetch({ 'https://flaky.dev/feed': fixture('feeds/blog-rss2.xml') }), now);
  expect(reload(d).failedSourceIds).toEqual([]);
});
