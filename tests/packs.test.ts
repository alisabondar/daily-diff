import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { sources } from '../src/db/schema.js';
import { loadPacks, seedSources, setPacks, type Pack } from '../src/packs/index.js';

let db: Db;
beforeEach(() => {
  db = openDb(join(mkdtempSync(join(tmpdir(), 'dd-')), 'test.db'));
  runMigrations(db);
});

const packs: Pack[] = [
  {
    id: 'a', name: 'A', emoji: 'a', defaultEnabled: true,
    sources: [
      { title: 'A1', url: 'https://a1.dev', feedUrl: 'https://a1.dev/feed', kind: 'rss', type: 'blog' },
      { title: 'A2', url: 'https://a2.dev', feedUrl: 'https://a2.dev/feed', kind: 'rss', type: 'news', defaultEnabled: false },
    ],
  },
  {
    id: 'b', name: 'B', emoji: 'b', defaultEnabled: false,
    sources: [{ title: 'HN', url: 'https://news.ycombinator.com', feedUrl: 'hn:front_page', kind: 'hn', type: 'community', hnTags: 'front_page', defaultEnabled: true }],
  },
];

const enabledFeeds = () => db.select().from(sources).where(eq(sources.enabled, true)).all().map((s) => s.feedUrl).sort();

test('all shipped packs load and validate, with no duplicate feedUrls', () => {
  const loaded = loadPacks();
  expect(loaded.length).toBeGreaterThanOrEqual(8);
  const feeds = loaded.flatMap((p) => p.sources.map((s) => s.feedUrl));
  expect(new Set(feeds).size).toBe(feeds.length);
});

test('books.json is ignored by loadPacks', () => {
  expect(loadPacks().map((p) => p.id)).not.toContain('books');
});

test('duplicate feedUrls across packs are an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  for (const id of ['x', 'y']) {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...packs[0], id }));
  }
  expect(() => loadPacks(dir)).toThrow(/duplicate/i);
});

test('an invalid pack fails validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ id: 'bad' }));
  expect(() => loadPacks(dir)).toThrow(/bad\.json/);
});

test('seeding twice gives the same row count, sources inserted disabled', () => {
  seedSources(db, packs);
  seedSources(db, packs);
  const rows = db.select().from(sources).all();
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => !r.enabled)).toBe(true);
  expect(rows.find((r) => r.feedUrl === 'hn:front_page')).toMatchObject({ pack: 'b', hnTags: 'front_page', kind: 'hn' });
});

test('re-seed keeps a manually toggled enabled and refreshes title', () => {
  seedSources(db, packs);
  db.update(sources).set({ enabled: true }).where(eq(sources.feedUrl, 'https://a2.dev/feed')).run();
  const renamed = structuredClone(packs);
  renamed[0]!.sources[1]!.title = 'A2 renamed';
  seedSources(db, renamed);
  const row = db.select().from(sources).where(eq(sources.feedUrl, 'https://a2.dev/feed')).get()!;
  expect(row.enabled).toBe(true);
  expect(row.title).toBe('A2 renamed');
});

test('seeding never touches custom sources', () => {
  db.insert(sources).values({ kind: 'rss', type: 'blog', title: 'Mine', url: 'https://m.dev', feedUrl: 'https://m.dev/feed', pack: null, enabled: true }).run();
  seedSources(db, packs);
  expect(db.select().from(sources).where(eq(sources.feedUrl, 'https://m.dev/feed')).get()).toMatchObject({ title: 'Mine', enabled: true, pack: null });
});

test('setPacks enables only defaultEnabled sources', () => {
  seedSources(db, packs);
  setPacks(db, ['a', 'b'], packs);
  expect(enabledFeeds()).toEqual(['hn:front_page', 'https://a1.dev/feed']);
});

test('setPacks with the same list leaves per-source toggles alone', () => {
  seedSources(db, packs);
  setPacks(db, ['a'], packs);
  db.update(sources).set({ enabled: false }).where(eq(sources.feedUrl, 'https://a1.dev/feed')).run();
  db.update(sources).set({ enabled: true }).where(eq(sources.feedUrl, 'https://a2.dev/feed')).run();
  setPacks(db, ['a'], packs);
  expect(enabledFeeds()).toEqual(['https://a2.dev/feed']);
});

test('disabling a pack disables all its sources', () => {
  seedSources(db, packs);
  setPacks(db, ['a', 'b'], packs);
  db.update(sources).set({ enabled: true }).where(eq(sources.feedUrl, 'https://a2.dev/feed')).run();
  setPacks(db, ['b'], packs);
  expect(enabledFeeds()).toEqual(['hn:front_page']);
});
