import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Config, loadConfig, saveConfig } from '../src/config.js';
import { backupIfUpgrading } from '../src/db/backup.js';
import { openDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { digests, items, sources, stories } from '../src/db/schema.js';
import { paths } from '../src/paths.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.DAILY_DIFF_HOME = home;
});
afterEach(() => {
  delete process.env.DAILY_DIFF_HOME;
});

function freshDb(): Db {
  const db = openDb(paths().db);
  runMigrations(db);
  return db;
}

function seedDigest(db: Db) {
  const [s] = db.insert(sources).values({ kind: 'rss', type: 'blog', title: 'S', url: 'https://s.dev', feedUrl: 'https://s.dev/feed' }).returning().all();
  const [d] = db.insert(digests).values({ date: '2026-10-29', kind: 'daily', windowStart: 0, windowEnd: 1, status: 'running' }).returning().all();
  return { source: s!, digest: d! };
}

test('migrations apply to an empty DB', () => {
  const db = freshDb();
  const tables = db.all<{ name: string }>(sql`select name from sqlite_master where type in ('table')`).map((r) => r.name);
  for (const t of ['sources', 'items', 'digests', 'stories', 'story_items', 'digest_entries', 'learn_items', 'favorites', 'favorite_tags', 'feedback', 'stories_fts']) {
    expect(tables).toContain(t);
  }
});

test('openDb enables WAL and foreign keys', () => {
  const db = openDb(paths().db);
  expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
  expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
});

test('FTS finds a story by a summary word, and not after delete', () => {
  const db = freshDb();
  const { digest } = seedDigest(db);
  const [st] = db.insert(stories).values({ digestId: digest.id, title: 'Release', summary: 'A new quokka framework' }).returning().all();
  const find = () => db.all<{ rowid: number }>(sql`select rowid from stories_fts where stories_fts match 'quokka'`);
  expect(find().map((r) => r.rowid)).toEqual([st!.id]);
  db.delete(stories).where(sql`id = ${st!.id}`).run();
  expect(find()).toEqual([]);
});

test('duplicate item url violates the unique constraint', () => {
  const db = freshDb();
  const { source } = seedDigest(db);
  const row = { sourceId: source.id, url: 'https://a.dev/x', title: 't', excerpt: '', content: '', publishedAt: 1, fetchedAt: 1 };
  db.insert(items).values(row).run();
  expect(() => db.insert(items).values(row).run()).toThrow(/UNIQUE/);
});

test('deleting a digest cascades to its stories', () => {
  const db = freshDb();
  const { digest } = seedDigest(db);
  db.insert(stories).values({ digestId: digest.id, title: 'x' }).run();
  db.delete(digests).run();
  expect(db.select().from(stories).all()).toEqual([]);
});

const defaults = Config.parse({});

test('backup is made on a version change', () => {
  const p = paths();
  writeFileSync(p.db, 'db');
  const out = backupIfUpgrading(p, '1.1.0', { ...defaults, lastRunVersion: '1.0.0' });
  expect(out).toMatch(/daily-diff-1\.0\.0-\d+\.db$/);
  expect(readdirSync(p.backups)).toHaveLength(1);
});

test('backup uses "unknown" when there is no lastRunVersion', () => {
  const p = paths();
  writeFileSync(p.db, 'db');
  expect(backupIfUpgrading(p, '1.0.0', defaults)).toMatch(/daily-diff-unknown-\d+\.db$/);
});

test('backup is skipped when the version is unchanged or no DB exists', () => {
  const p = paths();
  expect(backupIfUpgrading(p, '1.0.0', { ...defaults, lastRunVersion: '0.9.0' })).toBeNull();
  writeFileSync(p.db, 'db');
  saveConfig({ lastRunVersion: '1.0.0' });
  expect(backupIfUpgrading(p, '1.0.0', loadConfig())).toBeNull();
  expect(readdirSync(p.backups)).toHaveLength(0);
});

test('backups are pruned to the newest 5', () => {
  const p = paths();
  writeFileSync(p.db, 'db');
  for (let i = 0; i < 7; i++) {
    writeFileSync(join(p.backups, `daily-diff-0.0.${i}-${1000 + i}.db`), 'old');
  }
  backupIfUpgrading(p, '2.0.0', { ...defaults, lastRunVersion: '1.0.0' });
  const left = readdirSync(p.backups).sort();
  expect(left).toHaveLength(5);
  expect(left).not.toContain('daily-diff-0.0.0-1000.db');
  expect(left.some((f) => f.startsWith('daily-diff-1.0.0-'))).toBe(true);
});
