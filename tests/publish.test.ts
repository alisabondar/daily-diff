import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Config } from '../src/config.js';
import { FakeLlm } from '../src/llm/fake.js';
import { LlmError } from '../src/llm/types.js';
import type { Pack } from '../src/packs/index.js';
import { __resetLockForTests } from '../src/pipeline/run.js';
import type { PublishedScrub } from '../src/scrub/publish-shape.js';
import { runScrub } from '../src/scrub/publish.js';
import type { CatalogSource, LastPublished, ScrubStore } from '../src/scrub/store.js';
import { handlers } from './fixtures/llm/handlers.js';
import { fakeFetch, fixture } from './helpers.js';

const T0 = Date.parse('2026-10-28T20:00:00Z');
const DAY = 24 * 3600_000;
const SERVICE_KEY = 'sb_secret_TESTSERVICEKEY123';

process.env.TZ = 'UTC';
beforeEach(() => {
  __resetLockForTests();
  process.env.DAILY_DIFF_HOME = mkdtempSync(join(tmpdir(), 'dd-'));
});
afterEach(() => delete process.env.DAILY_DIFF_HOME);

class MemoryStore implements ScrubStore {
  scrubs = new Map<string, PublishedScrub>();
  catalog: CatalogSource[] = [];
  constructor(public last: LastPublished | null = null) {}
  async lastPublished(before: string) { return this.last && this.last.date < before ? this.last : null; }
  async upsertScrub(s: PublishedScrub) {
    const prev = this.scrubs.get(s.date);
    const byKey = new Map((prev?.stories ?? []).map((x) => [x.key, x]));
    for (const x of s.stories) byKey.set(x.key, x);
    this.scrubs.set(s.date, { ...s, stories: [...byKey.values()] });
  }
  async upsertCatalog(rows: CatalogSource[]) { this.catalog = rows; }
}

const PACKS: Pack[] = [
  { id: 'eng', name: 'Eng', emoji: 'x', defaultEnabled: false, sources: [{ title: 'Blog', url: 'https://blog.dev', feedUrl: 'https://blog.dev/feed', kind: 'rss', type: 'blog' }] },
  { id: 'community', name: 'C', emoji: 'y', defaultEnabled: false, sources: [{ title: 'Reddit', url: 'https://www.reddit.com/r/x', feedUrl: 'https://www.reddit.com/r/x/top/.rss?t=day', kind: 'rss', type: 'community' }] },
];
const fetchFn = () => fakeFetch({ 'https://blog.dev/feed': fixture('feeds/blog-rss2.xml'), 'https://www.reddit.com/*': fixture('feeds/reddit.xml') });
const config = Config.parse({ onboarded: true, provider: 'anthropic' });
const opts = (store: ScrubStore, over: Partial<Parameters<typeof runScrub>[0]> = {}) => ({
  store, config, llmFactory: () => new FakeLlm(handlers), now: () => new Date(T0), fetchFn: fetchFn(), packs: PACKS,
  secrets: [SERVICE_KEY], retryDelaysMs: [0, 0], ...over,
});

test('one run publishes the day with keyed stories and the catalog, without Reddit', async () => {
  const store = new MemoryStore();
  expect(await runScrub(opts(store))).toEqual(['2026-10-28']);
  const s = store.scrubs.get('2026-10-28')!;
  expect(s.stories.length).toBeGreaterThan(0);
  for (const x of s.stories) expect(x.key).toMatch(/^[0-9a-f]{16}$/);
  expect(JSON.stringify(s)).not.toContain('reddit.com');
  expect(store.catalog.map((c) => c.pack)).toEqual(['eng']);
  expect(store.catalog[0]!.key).toMatch(/^[0-9a-f]{16}$/);
});

test('a second run for the same date does not duplicate stories', async () => {
  const store = new MemoryStore();
  await runScrub(opts(store));
  const n = store.scrubs.get('2026-10-28')!.stories.length;
  __resetLockForTests();
  await runScrub(opts(store));
  expect(store.scrubs.get('2026-10-28')!.stories.length).toBe(n);
});

test('includeReddit publishes Reddit stories', async () => {
  const store = new MemoryStore();
  await runScrub(opts(store, { includeReddit: true }));
  expect(JSON.stringify(store.scrubs.get('2026-10-28'))).toContain('reddit.com');
  expect(store.catalog.map((c) => c.pack).sort()).toEqual(['community', 'eng']);
});

test('the window starts at the previous published windowEnd', async () => {
  const store = new MemoryStore({ date: '2026-10-27', windowEnd: T0 - 20 * 3600_000 });
  await runScrub(opts(store));
  expect(store.scrubs.get('2026-10-28')!.windowStart).toBe(T0 - 20 * 3600_000);
  expect(store.scrubs.has('2026-10-27')).toBe(false);
});

test('a gap of several days publishes each missed day too', async () => {
  const store = new MemoryStore({ date: '2026-10-24', windowEnd: T0 - 4 * DAY });
  const dates = await runScrub(opts(store));
  expect(dates).toContain('2026-10-28');
  expect(dates).not.toContain('2026-10-24');
  expect(dates).toEqual([...dates].sort());
});

test('a raw build (LLM failure) publishes nothing and rejects', async () => {
  const store = new MemoryStore();
  const failing = new FakeLlm({ group: () => new LlmError('boom', 'llm', false) });
  await expect(runScrub(opts(store, { llmFactory: () => failing }))).rejects.toThrow(/raw/i);
  expect(store.scrubs.size).toBe(0);
});

test('the service key never appears in a thrown message', async () => {
  const store = new MemoryStore();
  store.upsertScrub = async () => { throw new Error(`insert failed for key ${SERVICE_KEY}`); };
  const err = await runScrub(opts(store)).catch((e: Error) => e);
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).not.toContain(SERVICE_KEY);
  expect((err as Error).message).toContain('[redacted]');
});
