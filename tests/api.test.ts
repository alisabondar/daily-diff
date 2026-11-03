import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Config, loadConfig, saveConfig } from '../src/config.js';
import { digests, feedback, sources, stories } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { LlmError } from '../src/llm/types.js';
import { __resetLockForTests, ensureToday } from '../src/pipeline/run.js';
import { seedSources } from '../src/packs/index.js';
import { createApp } from '../src/server/app.js';
import type { AppDeps } from '../src/server/deps.js';
import { startup } from '../src/startup.js';
import { fakeFetch, fixture, seedSource, testDb } from './helpers.js';
import { handlers } from './fixtures/llm/handlers.js';

const T0 = Date.parse('2026-10-28T20:00:00Z');
const KEY = 'sk-ant-test-0123456789';
process.env.TZ = 'UTC';

let home: string;
beforeEach(() => {
  __resetLockForTests();
  home = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.DAILY_DIFF_HOME = home;
});
afterEach(() => {
  delete process.env.DAILY_DIFF_HOME;
  delete process.env.ANTHROPIC_API_KEY;
});

function setup(llm: FakeLlm | null = new FakeLlm(handlers)) {
  const db = testDb();
  seedSource(db, { feedUrl: 'https://blog.dev/feed', title: 'Blog' });
  seedSource(db, { feedUrl: 'https://pod.dev/feed', type: 'podcast', title: 'Pod' });
  seedSource(db, { feedUrl: 'hn:show_hn', kind: 'hn', hnTags: 'show_hn', type: 'community', title: 'Show HN' });
  const fetchFn = fakeFetch({
    'https://blog.dev/feed': fixture('feeds/blog-rss2.xml'),
    'https://pod.dev/feed': fixture('feeds/podcast.xml'),
    'https://hn.algolia.com/api/v1/search_by_date*': fixture('hn/search.json'),
    'https://hn.algolia.com/api/v1/items/*': fixture('hn/item.json'),
  });
  saveConfig({ onboarded: true, provider: 'anthropic', fastModel: 'f', strongModel: 's' });
  writeFileSync(join(home, '.env'), `ANTHROPIC_API_KEY=${KEY}\n`);
  const webDir = join(home, 'web');
  mkdirSync(join(webDir, 'assets'), { recursive: true });
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Daily Diff</title>');
  writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log(1)');
  const deps: AppDeps = {
    db, fetchFn, now: () => new Date(T0), retryDelaysMs: [0, 0],
    getConfig: loadConfig, saveConfig, llmFactory: () => llm, createLlm: () => llm, webDir,
  };
  const app = createApp(deps);
  const req = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  return { db, deps, app, req };
}

async function built() {
  const s = setup();
  await ensureToday(s.deps);
  return s;
}

test('POST /api/ensure starts a build and reports the date', async () => {
  const { req, deps } = setup();
  const res = await req('POST', '/api/ensure');
  expect(res).toMatchObject({ status: 200, json: { started: true, digestDate: '2026-10-28' } });
  await ensureToday(deps); // join the in-flight build so the test ends cleanly
});

test('GET /api/status reports today, progress and failed sources', async () => {
  const { req, db } = await built();
  const bad = db.select().from(sources).where(eq(sources.title, 'Pod')).get()!;
  db.update(sources).set({ lastError: 'HTTP 500' }).where(eq(sources.id, bad.id)).run();
  db.update(digests).set({ failedSourceIds: [bad.id] }).run();
  const { status, json } = await req('GET', '/api/status');
  expect(status).toBe(200);
  expect(json).toMatchObject({
    onboarded: true,
    progress: { running: false },
    today: { date: '2026-10-28', status: 'done', stage: 8, isRaw: false, errorCode: null },
    latestDoneDate: '2026-10-28',
    failedSources: [{ id: bad.id, title: 'Pod', lastError: 'HTTP 500' }],
  });
});

test('GET /api/digests lists done digests newest first; 400 on a bad before', async () => {
  const { req, db } = await built();
  db.insert(digests).values({ date: '2026-10-20', kind: 'catchup', status: 'done', windowStart: 0, windowEnd: 1, isRaw: true }).run();
  const { json } = await req('GET', '/api/digests?limit=60');
  expect(json.map((d: any) => d.date)).toEqual(['2026-10-28', '2026-10-20']);
  expect(json[0].highlightCount).toBeGreaterThan(0);
  expect(json[1]).toEqual({ date: '2026-10-20', kind: 'catchup', isRaw: true, highlightCount: 0 });
  expect((await req('GET', '/api/digests?before=2026-10-28')).json.map((d: any) => d.date)).toEqual(['2026-10-20']);
  expect((await req('GET', '/api/digests?before=yesterday')).status).toBe(400);
});

test('GET /api/digests/:date returns sections, stories, links and learn; 400 / 404', async () => {
  const { req } = await built();
  const { status, json } = await req('GET', '/api/digests/2026-10-28');
  expect(status).toBe(200);
  expect(json.meta).toMatchObject({ date: '2026-10-28', kind: 'daily', isRaw: false, status: 'done' });
  expect(json.highlights.length).toBeGreaterThan(0);
  const order = ['models', 'tools', 'headlines', 'watch'];
  expect(json.highlights.map((h: any) => order.indexOf(h.section))).toEqual([...json.highlights.map((h: any) => order.indexOf(h.section))].sort());
  const story = json.highlights[0].stories[0];
  expect(Object.keys(story).sort()).toEqual(['category', 'cons', 'favorite', 'id', 'links', 'pros', 'stats', 'summary', 'title']);
  expect(story.links[0]).toHaveProperty('sourceTitle');
  expect(story.favorite).toBeNull();
  expect(json.more.map((m: any) => m.section)).toEqual(expect.arrayContaining(['podcasts']));
  expect(json.learn.concept).toMatchObject({ type: 'concept', conceptKey: 'write-ahead-log' });
  expect(json.learn.concept.quiz).toHaveLength(3);
  expect(json.learn.quickstart).toMatchObject({ type: 'quickstart' });
  expect((await req('GET', '/api/digests/nope')).status).toBe(400);
  expect((await req('GET', '/api/digests/2020-01-01')).status).toBe(404);
});

test('a raw digest returns learn: null', async () => {
  const s = setup(new FakeLlm({ ...handlers, group: () => new LlmError('no', 'auth', false) }));
  await ensureToday(s.deps);
  expect((await s.req('GET', '/api/digests/2026-10-28')).json).toMatchObject({ meta: { isRaw: true, errorCode: 'auth' }, learn: null });
});

test('GET /api/search finds a seeded story; query is sanitized; 400 without q', async () => {
  const { req, db } = await built();
  const d = db.select().from(digests).get()!;
  db.insert(stories).values({ digestId: d.id, title: 'Quokka ships', summary: 'The marsupial framework hits 1.0' }).run();
  const { json } = await req('GET', '/api/search?q=' + encodeURIComponent('marsup* "('));
  expect(json).toHaveLength(1);
  expect(json[0]).toMatchObject({ digestDate: '2026-10-28', story: { title: 'Quokka ships' } });
  expect((await req('GET', '/api/search?q=')).status).toBe(400);
});

test('favorites: PUT upserts with tags, GET filters by tag with counts, DELETE removes; 400 on bad tags', async () => {
  const { req } = await built();
  const id = (await req('GET', '/api/digests/2026-10-28')).json.highlights[0].stories[0].id;
  expect((await req('PUT', `/api/favorites/${id}`, { tags: ['  AI ', 'tools', 'ai'] })).status).toBe(200);
  let fav = await req('GET', '/api/favorites');
  expect(fav.json.stories.map((s: any) => s.id)).toEqual([id]);
  expect(fav.json.stories[0].favorite).toEqual({ tags: ['ai', 'tools'] });
  expect(fav.json.tags).toEqual([{ tag: 'ai', count: 1 }, { tag: 'tools', count: 1 }]);
  await req('PUT', `/api/favorites/${id}`, { tags: ['later'] });
  expect((await req('GET', '/api/favorites?tag=ai')).json.stories).toEqual([]);
  expect((await req('GET', '/api/favorites?tag=later')).json.stories).toHaveLength(1);
  expect((await req('PUT', `/api/favorites/${id}`, { tags: ['x'.repeat(33)] })).status).toBe(400);
  expect((await req('PUT', `/api/favorites/${id}`, { tags: 'ai' })).status).toBe(400);
  expect((await req('DELETE', `/api/favorites/${id}`)).status).toBe(200);
  expect((await req('GET', '/api/favorites')).json).toEqual({ stories: [], tags: [] });
});

test('POST /api/feedback records less_like_this; 400 on a bad kind', async () => {
  const { req, db } = await built();
  const story = db.select().from(stories).get()!;
  expect((await req('POST', '/api/feedback', { storyId: story.id, kind: 'less_like_this' })).status).toBe(200);
  expect(db.select().from(feedback).all()).toHaveLength(1);
  expect((await req('POST', '/api/feedback', { storyId: story.id, kind: 'more' })).status).toBe(400);
});

test('sources: list, add custom, patch, delete custom; pack sources cannot be deleted; 400s', async () => {
  const { req, db } = setup();
  expect((await req('GET', '/api/sources')).json.length).toBe(3);
  const added = await req('POST', '/api/sources', { feedUrl: 'https://mine.dev/feed', title: 'Mine', url: 'https://mine.dev', type: 'blog' });
  expect(added).toMatchObject({ status: 200, json: { feedUrl: 'https://mine.dev/feed', pack: null, kind: 'rss', enabled: true } });
  expect((await req('POST', '/api/sources', { feedUrl: 'not a url', title: 'x', url: 'x', type: 'blog' })).status).toBe(400);
  expect((await req('PATCH', `/api/sources/${added.json.id}`, { enabled: false, title: 'Renamed', type: 'news' })).json).toMatchObject({ enabled: false, title: 'Renamed', type: 'news' });
  expect((await req('PATCH', `/api/sources/${added.json.id}`, { type: 'tweet' })).status).toBe(400);
  expect((await req('DELETE', `/api/sources/${added.json.id}`)).status).toBe(200);
  const packSource = db.insert(sources).values({ kind: 'rss', type: 'blog', title: 'P', url: 'https://p.dev', feedUrl: 'https://p.dev/feed', pack: 'ai-news' }).returning().get();
  const del = await req('DELETE', `/api/sources/${packSource.id}`);
  expect(del.status).toBe(400);
  expect(del.json.error).toMatch(/disable instead/i);
});

test('packs: GET lists with counts and enabled; POST enables via setPacks; 400 on bad body', async () => {
  const { req, db } = setup();
  seedSources(db);
  const { json } = await req('GET', '/api/packs');
  const ai = json.find((p: any) => p.id === 'ai-news');
  expect(ai).toMatchObject({ name: 'AI News', enabled: false });
  expect(ai.sourceCount).toBeGreaterThan(0);
  expect((await req('POST', '/api/packs', { enabled: ['ai-news'] })).status).toBe(200);
  expect((await req('GET', '/api/packs')).json.find((p: any) => p.id === 'ai-news').enabled).toBe(true);
  expect((await req('POST', '/api/packs', { enabled: 'ai-news' })).status).toBe(400);
});

test('GET /api/settings never includes the apiKey', async () => {
  const { req } = setup();
  const res = await req('GET', '/api/settings');
  expect(res.text).not.toContain(KEY);
  expect(res.json).not.toHaveProperty('apiKey');
  expect(res.json).toMatchObject({ provider: 'anthropic', keySource: 'file', envFile: join(home, '.env'), onboarded: true });
  expect(res.json.providers).toEqual(expect.arrayContaining([
    { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY', keySource: 'file' },
    { id: 'openai', envVar: 'OPENAI_API_KEY', keySource: 'none' },
    { id: 'ollama', envVar: null, keySource: 'none' },
  ]));
  expect(res.json.suggestedModels.anthropic).toHaveProperty('fast');
  process.env.ANTHROPIC_API_KEY = 'env-key-xyz';
  const env = await req('GET', '/api/settings');
  expect(env.json.keySource).toBe('env');
  expect(env.text).not.toContain('env-key-xyz');
});

test('PUT /api/settings saves a partial config; 400 on an apiKey or bad values', async () => {
  const { req } = setup();
  const res = await req('PUT', '/api/settings', { profile: 'Rust dev', highlightsCap: 12 });
  expect(res.status).toBe(200);
  expect(loadConfig()).toMatchObject({ profile: 'Rust dev', highlightsCap: 12 });
  const withKey = await req('PUT', '/api/settings', { apiKey: 'new-key-123' });
  expect(withKey.status).toBe(400);
  expect(readFileSync(join(home, 'config.json'), 'utf8')).not.toContain('new-key-123');
  expect((await req('PUT', '/api/settings', { highlightsCap: 99 })).status).toBe(400);
});

test('POST /api/settings/test pings with an unsaved config; failures are redacted', async () => {
  const ok = setup();
  expect((await ok.req('POST', '/api/settings/test', { provider: 'anthropic', fastModel: 'f' })).json).toEqual({ ok: true });
  const bad = setup(new FakeLlm({ ping: () => new LlmError(`401 invalid key ${KEY}`, 'auth', false) }));
  const res = await bad.req('POST', '/api/settings/test', { provider: 'anthropic', fastModel: 'f' });
  expect(res.json).toEqual({ ok: false, code: 'auth', message: '401 invalid key [redacted]' });
  expect((await bad.req('POST', '/api/settings/test', { provider: 'anthropic', fastModel: 'f', apiKey: 'x' })).status).toBe(400);
  expect((await bad.req('POST', '/api/settings/test', { provider: 'nope' })).status).toBe(400);
});

test('POST /api/settings/test reports a missing key or model', async () => {
  const s = setup(null);
  expect((await s.req('POST', '/api/settings/test', { provider: 'openai', fastModel: 'x' })).json).toMatchObject({ ok: false, code: 'auth' });
});

test('POST /api/onboarding/complete sets onboarded and starts a build', async () => {
  const { req, deps } = setup();
  saveConfig({ onboarded: false });
  const res = await req('POST', '/api/onboarding/complete');
  expect(res.json).toMatchObject({ started: true, digestDate: '2026-10-28' });
  expect(loadConfig().onboarded).toBe(true);
  await ensureToday(deps);
});

test('GET /* serves the web app with SPA fallback', async () => {
  const { req } = setup();
  expect((await req('GET', '/assets/app.js')).text).toBe('console.log(1)');
  expect((await req('GET', '/archive')).text).toContain('<title>Daily Diff</title>');
  expect((await req('GET', '/api/nope')).status).toBe(404);
});

test('startup binds the server to 127.0.0.1', async () => {
  const calls: any[] = [];
  const serve = ((opts: any) => {
    calls.push(opts);
    return { close: () => {} };
  }) as any;
  const { close } = await startup({ port: 4300, serve, fetchFn: fakeFetch({}) });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ hostname: '127.0.0.1', port: 4300 });
  expect(loadConfig().lastRunVersion).toBeDefined();
  close();
});

test('POST /api/sources/discover returns the discovery result; 400 without url', async () => {
  const s = setup();
  const app = createApp({ ...s.deps, fetchFn: fakeFetch({ 'https://pod.dev/rss': fixture('feeds/podcast.xml') }) });
  const res = await app.request('/api/sources/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://pod.dev/rss' }) });
  expect(await res.json()).toMatchObject({ found: true, feedUrl: 'https://pod.dev/rss', suggestedType: 'podcast' });
  expect((await s.req('POST', '/api/sources/discover', {})).status).toBe(400);
});
