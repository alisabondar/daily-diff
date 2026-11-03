import { eq } from 'drizzle-orm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Config } from '../src/config.js';
import { digestEntries, digests, learnItems, stories } from '../src/db/schema.js';
import { FakeLlm, type FakeHandlers } from '../src/llm/fake.js';
import { LlmError } from '../src/llm/types.js';
import { progress } from '../src/pipeline/progress.js';
import { __resetLockForTests, ensureToday, type EnsureDeps } from '../src/pipeline/run.js';
import { fakeFetch, fixture, seedSource, testDb } from './helpers.js';
import { handlers } from './fixtures/llm/handlers.js';

type Db = ReturnType<typeof testDb>;
const DAY = 24 * 3600_000;
const T0 = Date.parse('2026-10-28T20:00:00Z');

process.env.TZ = 'UTC';
beforeEach(() => {
  __resetLockForTests();
  process.env.DAILY_DIFF_HOME = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.ANTHROPIC_API_KEY = 'sk-test-secret';
});
afterEach(() => {
  delete process.env.DAILY_DIFF_HOME;
  delete process.env.ANTHROPIC_API_KEY;
});

function setup() {
  const db = testDb();
  seedSource(db, { feedUrl: 'https://blog.dev/feed', title: 'Blog' });
  seedSource(db, { feedUrl: 'https://pod.dev/feed', type: 'podcast', title: 'Pod' });
  seedSource(db, { feedUrl: 'https://yt.dev/feed', type: 'video', title: 'Tube' });
  seedSource(db, { feedUrl: 'hn:show_hn', kind: 'hn', hnTags: 'show_hn', type: 'community', title: 'Show HN' });
  const fetchFn = fakeFetch({
    'https://blog.dev/feed': fixture('feeds/blog-rss2.xml'),
    'https://pod.dev/feed': fixture('feeds/podcast.xml'),
    'https://yt.dev/feed': fixture('feeds/youtube.xml'),
    'https://hn.algolia.com/api/v1/search_by_date*': fixture('hn/search.json'),
    'https://hn.algolia.com/api/v1/items/*': fixture('hn/item.json'),
  });
  return { db, fetchFn };
}

function deps(db: Db, fetchFn: typeof fetch, llm: FakeLlm | null, at = T0, config: Partial<Config> = {}): EnsureDeps {
  return {
    db, fetchFn, now: () => new Date(at), retryDelaysMs: [0, 0],
    getConfig: () => Config.parse({ onboarded: true, provider: 'anthropic', ...config }),
    llmFactory: () => llm,
  };
}

const theDigest = (db: Db, date = '2026-10-28') => db.select().from(digests).where(eq(digests.date, date)).get()!;
const callsFor = (fake: FakeLlm, task: string) => fake.calls.filter((c) => c.task === task).length;

test('happy path: done digest, highlights ≤ cap, 2 learn items, nonzero tokens', async () => {
  const { db, fetchFn } = setup();
  const fake = new FakeLlm(handlers);
  expect(await ensureToday(deps(db, fetchFn, fake, T0, { highlightsCap: 4 }))).toEqual({ started: true, digestDate: '2026-10-28' });
  const d = theDigest(db);
  expect(d).toMatchObject({ status: 'done', stage: 8, isRaw: false, errorCode: null, kind: 'daily' });
  expect(d.inputTokens).toBeGreaterThan(0);
  expect(d.outputTokens).toBeGreaterThan(0);
  expect(d.completedAt).toBe(T0);
  expect(d.durationMs).not.toBeNull();
  const hl = db.select().from(digestEntries).where(eq(digestEntries.tab, 'highlights')).all();
  expect(hl.length).toBeGreaterThan(0);
  expect(hl.length).toBeLessThanOrEqual(4);
  expect(db.select().from(learnItems).all()).toHaveLength(2);
  expect(progress.get().running).toBe(false);
});

test('a done digest for today is returned without rebuilding', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  const again = new FakeLlm(handlers);
  expect(await ensureToday(deps(db, fetchFn, again))).toEqual({ started: false, digestDate: '2026-10-28' });
  expect(again.calls).toEqual([]);
});

test('not onboarded: nothing happens', async () => {
  const { db, fetchFn } = setup();
  const fake = new FakeLlm(handlers);
  expect(await ensureToday(deps(db, fetchFn, fake, T0, { onboarded: false }))).toEqual({ started: false, digestDate: null });
  expect(db.select().from(digests).all()).toEqual([]);
  expect(fetchFn.calls).toEqual([]);
});

test('an auth error at S3 gives a raw digest with errorCode auth, not retried, key redacted', async () => {
  const { db, fetchFn } = setup();
  const fake = new FakeLlm({ ...handlers, group: () => new LlmError('401 invalid x-api-key sk-test-secret', 'auth', false) });
  await ensureToday(deps(db, fetchFn, fake));
  const d = theDigest(db);
  expect(d).toMatchObject({ status: 'done', isRaw: true, errorCode: 'auth', stage: 8 });
  expect(d.errorMessage).toContain('[redacted]');
  expect(d.errorMessage).not.toContain('sk-test-secret');
  expect(callsFor(fake, 'group')).toBe(1);
  expect(db.select().from(learnItems).all()).toEqual([]);
  const more = db.select().from(digestEntries).all();
  expect(more.length).toBeGreaterThan(0);
  expect(more.every((e) => e.tab === 'more')).toBe(true);
});

test('raw digest: one story per window item, summary = excerpt, newest first', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, new FakeLlm({ ...handlers, group: () => new LlmError('no', 'auth', false) })));
  const rows = db.select().from(stories).all();
  const pod = rows.find((s) => s.title === 'Episode 42: Agents')!;
  expect(pod).toMatchObject({ summary: 'We talk about agents.', category: 'podcast' });
  const entry = db.select().from(digestEntries).where(eq(digestEntries.storyId, pod.id)).get()!;
  expect(entry).toMatchObject({ tab: 'more', section: 'podcasts' });
  const longReads = db.select().from(digestEntries).where(eq(digestEntries.section, 'long-reads')).all().sort((a, b) => a.position - b.position);
  expect(longReads.map((e) => rows.find((s) => s.id === e.storyId)!.title)).toEqual(['Undated post', 'Shipping & scaling']);
});

test('an LLM error at S6 is retried, then falls back to raw', async () => {
  const { db, fetchFn } = setup();
  const fake = new FakeLlm({ ...handlers, summarize: () => new LlmError('overloaded', 'llm', true) });
  await ensureToday(deps(db, fetchFn, fake));
  expect(theDigest(db)).toMatchObject({ isRaw: true, errorCode: 'llm', status: 'done' });
  expect(callsFor(fake, 'summarize')).toBeGreaterThanOrEqual(3);
});

test('resume after a crash at S4 starts at S5 without re-running S3 and S4', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  const before = theDigest(db);
  db.update(digests).set({ status: 'running', stage: 4 }).where(eq(digests.id, before.id)).run();
  __resetLockForTests();
  const fake = new FakeLlm(handlers);
  expect((await ensureToday(deps(db, fetchFn, fake))).started).toBe(true);
  expect(callsFor(fake, 'group')).toBe(0);
  expect(callsFor(fake, 'score')).toBe(0);
  expect(callsFor(fake, 'summarize')).toBeGreaterThan(0);
  expect(callsFor(fake, 'compose')).toBe(1);
  const after = theDigest(db);
  expect(after).toMatchObject({ status: 'done', stage: 8 });
  expect(after.inputTokens).toBeGreaterThan(before.inputTokens);
});

test('two concurrent ensureToday calls give one build', async () => {
  const { db, fetchFn } = setup();
  const fake = new FakeLlm(handlers);
  const [a, b] = await Promise.all([ensureToday(deps(db, fetchFn, fake)), ensureToday(deps(db, fetchFn, fake))]);
  expect(a).toEqual({ started: true, digestDate: '2026-10-28' });
  expect(b).toEqual({ started: true, digestDate: '2026-10-28' });
  expect(callsFor(fake, 'compose')).toBe(1);
  expect(db.select().from(digests).all()).toHaveLength(1);
});

test('a crash in the middle of S3 followed by a rerun leaves no duplicate stories', async () => {
  const { db, fetchFn } = setup();
  await expect(ensureToday(deps(db, fetchFn, new FakeLlm({ ...handlers, group: () => { throw new TypeError('process died'); } })))).resolves.toBeDefined();
  // simulate the process dying mid-S3: the digest row is still at stage 2
  db.update(digests).set({ status: 'running', stage: 2, isRaw: false, errorCode: null }).run();
  __resetLockForTests();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  const rows = db.select().from(stories).all();
  expect(new Set(rows.map((s) => s.title)).size).toBe(rows.length);
  expect(theDigest(db)).toMatchObject({ status: 'done', isRaw: false });
});

test('a null llmFactory produces a raw digest with errorCode auth', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, null));
  expect(theDigest(db)).toMatchObject({ status: 'done', isRaw: true, errorCode: 'auth' });
  expect(db.select().from(stories).all().length).toBeGreaterThan(0);
});

test('S1–S2 failure sets status failed / unknown, and the next call resumes', async () => {
  const { db, fetchFn } = setup();
  // per-source fetch failures are tolerated, so make S2's writes fail instead
  db.$client.exec("CREATE TRIGGER fail_items BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  expect(theDigest(db)).toMatchObject({ status: 'failed', errorCode: 'unknown' });
  expect(theDigest(db).errorMessage).toMatch(/disk full/);
  db.$client.exec('DROP TRIGGER fail_items');
  __resetLockForTests();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  expect(theDigest(db)).toMatchObject({ status: 'done', isRaw: false, errorCode: null, errorMessage: null });
});

test('the next day gets a new digest whose windowStart equals the previous windowEnd', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  __resetLockForTests();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers), T0 + DAY));
  const d1 = theDigest(db, '2026-10-28');
  const d2 = theDigest(db, '2026-10-29');
  expect(d2.windowStart).toBe(d1.windowEnd);
  expect(d2).toMatchObject({ kind: 'daily', status: 'done' });
});

test('a 3-day gap gives a catchup digest with a cap of 8', async () => {
  const { db, fetchFn } = setup();
  await ensureToday(deps(db, fetchFn, new FakeLlm(handlers)));
  __resetLockForTests();
  const fake = new FakeLlm(handlers);
  await ensureToday(deps(db, fetchFn, fake, T0 + 3 * DAY));
  expect(theDigest(db, '2026-10-31')).toMatchObject({ kind: 'catchup' });
  // no new items in the window → quiet day, so check the cap via a digest with fresh items instead
  const fresh = setup();
  fresh.db.insert(digests).values({ date: '2026-10-25', kind: 'daily', status: 'done', windowStart: 0, windowEnd: T0 - 3 * DAY }).run();
  const fake2 = new FakeLlm(handlers);
  await ensureToday(deps(fresh.db, fresh.fetchFn, fake2));
  expect(theDigest(fresh.db)).toMatchObject({ kind: 'catchup', windowStart: T0 - 3 * DAY });
  expect(fake2.calls.find((c) => c.task === 'compose')!.system).toContain('at most 8');
});
