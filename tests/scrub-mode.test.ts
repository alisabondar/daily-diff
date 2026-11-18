import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { digests, stories, storyItems, type Category, type Topic } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runS1 } from '../src/pipeline/s1-fetch.js';
import { runS4 } from '../src/pipeline/s4-score.js';
import { runS5 } from '../src/pipeline/s5-enrich.js';
import { runS6 } from '../src/pipeline/s6-summarize.js';
import { selectForSummary } from '../src/pipeline/scrub.js';
import { ctx, fakeFetch, fixture, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

const NO_REDDIT = { profile: '', includeReddit: false };
const WITH_REDDIT = { profile: '', includeReddit: true };
const now = () => new Date('2026-10-22T12:00:00Z');
const noSleep = async () => {};

// ---------- S1 ----------

function s1Setup() {
  const db = testDb();
  const digest = seedDigest(db, { stage: 0, windowStart: 0 });
  const off = seedSource(db, { feedUrl: 'https://off.dev/feed', pack: 'engineering', enabled: false });
  const reddit = seedSource(db, { feedUrl: 'https://www.reddit.com/r/x/top/.rss?t=day', type: 'community', pack: 'community', enabled: true });
  const fetchFn = fakeFetch({ 'https://off.dev/feed': fixture('feeds/blog-rss2.xml'), 'https://www.reddit.com/*': fixture('feeds/reddit.xml') });
  return { db, digest, off, reddit, fetchFn };
}

test('S1 in scrub mode fetches a disabled pack source; outside scrub mode it does not', async () => {
  const a = s1Setup();
  await runS1(a.db, a.digest, { fetchFn: a.fetchFn, now, sleep: noSleep, scrub: NO_REDDIT });
  expect(a.fetchFn.calls.map((c) => c.url)).toContain('https://off.dev/feed');

  const b = s1Setup();
  await runS1(b.db, b.digest, { fetchFn: b.fetchFn, now, sleep: noSleep });
  expect(b.fetchFn.calls.map((c) => c.url)).not.toContain('https://off.dev/feed');
});

test('S1 in scrub mode skips Reddit feeds unless includeReddit', async () => {
  const a = s1Setup();
  await runS1(a.db, a.digest, { fetchFn: a.fetchFn, now, sleep: noSleep, scrub: NO_REDDIT });
  expect(a.fetchFn.calls.some((c) => c.url.includes('reddit.com'))).toBe(false);

  const b = s1Setup();
  await runS1(b.db, b.digest, { fetchFn: b.fetchFn, now, sleep: noSleep, scrub: WITH_REDDIT });
  expect(b.fetchFn.calls.some((c) => c.url.includes('reddit.com'))).toBe(true);
});

// ---------- S4 ----------

test('S4 in scrub mode uses the scrub profile, not config.profile', async () => {
  const db = testDb();
  const d = seedDigest(db, { stage: 3 });
  const src = seedSource(db);
  const s = db.insert(stories).values({ digestId: d.id, title: 'A' }).returning().get();
  db.insert(storyItems).values({ storyId: s.id, itemId: seedItem(db, src.id).id }).run();
  const fake = new FakeLlm({ score: () => ({ scores: [] }) });
  await runS4(ctx(db, fake, { scrub: { profile: 'SCRUB-PROFILE-MARKER', includeReddit: false } }));
  expect(fake.calls[0]!.system).toContain('SCRUB-PROFILE-MARKER');
});

// ---------- S5 ----------

test('S5 in scrub mode makes no Reddit comment call unless includeReddit', async () => {
  const run = async (scrub: typeof NO_REDDIT) => {
    const db = testDb();
    const d = seedDigest(db, { stage: 4 });
    const src = seedSource(db);
    const row = db.insert(stories).values({ digestId: d.id, title: 'T', category: 'model', score: 9 }).returning().get();
    db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, src.id, { hnId: 1 }).id }).run();
    db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, src.id, { discussionUrl: 'https://www.reddit.com/r/x/comments/abc/t/' }).id }).run();
    const fetchFn = fakeFetch({ 'https://hn.algolia.com/api/v1/items/1': JSON.stringify({ children: [{ text: 'hn' }] }), 'https://www.reddit.com/*': '[]' });
    await runS5(ctx(db, new FakeLlm({}), { fetchFn, scrub }));
    return fetchFn.calls.map((c) => c.url);
  };
  expect((await run(NO_REDDIT)).some((u) => u.includes('reddit.com'))).toBe(false);
  expect((await run(WITH_REDDIT)).some((u) => u.includes('reddit.com'))).toBe(true);
});

// ---------- selectForSummary ----------

type S = { id: number; score: number | null; category: Category | null; topic: Topic | null };
const st = (id: number, score: number, category: Category, topic: Topic): S => ({ id, score, category, topic });
const opts = { threshold: 5, perGroup: 2, cap: 60 };

test('selectForSummary takes the top perGroup of each category', () => {
  const xs = [st(1, 9, 'tool', 'other'), st(2, 8, 'tool', 'other'), st(3, 7, 'tool', 'other'), st(4, 6, 'headline', 'other')];
  // topic 'other' alone would pick 1 and 2; category picks add 4.
  expect(selectForSummary(xs, opts).sort()).toEqual([1, 2, 4]);
});

test('selectForSummary takes the top perGroup of each topic', () => {
  const xs = [st(1, 9, 'tool', 'ai'), st(2, 8, 'tool', 'ai'), st(3, 6, 'tool', 'security')];
  // category 'tool' picks 1 and 2; topic 'security' adds 3.
  expect(selectForSummary(xs, opts).sort()).toEqual([1, 2, 3]);
});

test('selectForSummary excludes stories below the threshold and null scores', () => {
  const xs = [st(1, 4, 'tool', 'ai'), { id: 2, score: null, category: 'tool', topic: 'ai' } as S, st(3, 5, 'tool', 'ai')];
  expect(selectForSummary(xs, opts)).toEqual([3]);
});

test('selectForSummary always keeps every model story above the threshold', () => {
  const xs = [st(1, 9, 'model', 'ai'), st(2, 8, 'model', 'ai'), st(3, 7, 'model', 'ai'), st(4, 3, 'model', 'ai')];
  expect(selectForSummary(xs, opts).sort()).toEqual([1, 2, 3]);
});

test('selectForSummary applies the cap by highest score, ties to the lower id', () => {
  const xs = [st(1, 9, 'tool', 'ai'), st(2, 7, 'headline', 'infra'), st(3, 7, 'video', 'research'), st(4, 6, 'podcast', 'security')];
  expect(selectForSummary(xs, { ...opts, cap: 3 }).sort()).toEqual([1, 2, 3]);
});

test('selectForSummary breaks ties inside a group by the lower id', () => {
  const xs = [st(5, 8, 'tool', 'ai'), st(2, 8, 'tool', 'ai'), st(9, 8, 'tool', 'ai')];
  expect(selectForSummary(xs, { ...opts, perGroup: 1 })).toEqual([2]);
});

// ---------- S6 ----------

test('S6 in scrub mode summarizes exactly the selected stories', async () => {
  const db = testDb();
  const d = seedDigest(db, { stage: 5 });
  const src = seedSource(db);
  const mk = (score: number, category: Category, topic: Topic) => {
    const row = db.insert(stories).values({ digestId: d.id, title: `S${score}`, score, category, topic }).returning().get();
    db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, src.id).id }).run();
    return row.id;
  };
  // 7 tools above threshold in one topic: perGroup 6 → 6 picked; one below threshold.
  const ids = [9, 9, 8, 8, 7, 7, 6].map((s) => mk(s, 'tool', 'dev-tools'));
  mk(2, 'tool', 'dev-tools');
  const fake = new FakeLlm({ summarize: () => ({ summary: 'ok' }) });
  await runS6(ctx(db, fake, { scrub: NO_REDDIT }));
  const summarized = db.select().from(stories).all().filter((s) => s.summary === 'ok').map((s) => s.id).sort((a, b) => a - b);
  expect(summarized).toEqual(ids.slice(0, 6).sort((a, b) => a - b));
  expect(db.select().from(digests).where(eq(digests.id, d.id)).get()!.stage).toBe(6);
});
