import { readFileSync } from 'node:fs';
import type { Source } from '../src/sources/types.js';

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** A fetchFn that serves fixed bodies by exact URL (or URL prefix ending in `*`), recording every call. */
export function fakeFetch(routes: Record<string, string | number | (() => Promise<Response>)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => (k.endsWith('*') ? url.startsWith(k.slice(0, -1)) : k === url));
    if (key === undefined) return new Response('not found', { status: 404 });
    const r = routes[key]!;
    if (typeof r === 'function') return r();
    if (typeof r === 'number') return new Response('', { status: r });
    return new Response(r, { status: 200 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

export function source(over: Partial<Source> = {}): Source {
  return {
    id: 1, kind: 'rss', type: 'blog', title: 'Src', url: 'https://src.dev', feedUrl: 'https://src.dev/feed',
    hnTags: null, pack: null, enabled: true, lastFetchedAt: null, lastStatus: null, lastError: null, createdAt: 0,
    ...over,
  };
}

import { mkdtempSync as _mkdtemp } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { join as _join } from 'node:path';
import { Config } from '../src/config.js';
import { openDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { digests, items, sources } from '../src/db/schema.js';
import type { Llm } from '../src/llm/types.js';
import type { StageCtx } from '../src/pipeline/context.js';

export function testDb(): Db {
  const db = openDb(_join(_mkdtemp(_join(_tmpdir(), 'dd-')), 'test.db'));
  runMigrations(db);
  return db;
}

/** A digest whose window (0, 1e15] covers every seeded item. */
export function seedDigest(db: Db, over: Partial<typeof digests.$inferInsert> = {}) {
  return db.insert(digests).values({ date: '2026-10-29', kind: 'daily', status: 'running', windowStart: 0, windowEnd: 1e15, stage: 2, ...over }).returning().get();
}

export function seedSource(db: Db, over: Partial<typeof sources.$inferInsert> = {}) {
  const feedUrl = over.feedUrl ?? `https://src${Math.random()}.dev/feed`;
  return db.insert(sources).values({ kind: 'rss', type: 'blog', title: 'Src', url: feedUrl, feedUrl, ...over }).returning().get();
}

let itemSeq = 0;
export function seedItem(db: Db, sourceId: number, over: Partial<typeof items.$inferInsert> = {}) {
  itemSeq++;
  return db.insert(items).values({
    sourceId, url: `https://ex.dev/item-${itemSeq}`, title: `Item ${itemSeq}`, excerpt: `Excerpt ${itemSeq}`, content: `Content ${itemSeq}`,
    publishedAt: 1000 + itemSeq, fetchedAt: 1000 + itemSeq, ...over,
  }).returning().get();
}

export function ctx(db: Db, llm: Llm, over: Partial<StageCtx> = {}): StageCtx {
  const digest = db.select().from(digests).get()!;
  return { db, digest, llm, config: Config.parse({ onboarded: true }), retryDelaysMs: [0, 0], ...over };
}
