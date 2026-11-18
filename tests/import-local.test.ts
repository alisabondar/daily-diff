import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { favorites, favoriteTags, feedback, reads, stories, storyItems } from '../src/db/schema.js';
import { importLocal } from '../src/scrub/import-local.js';
import { storyKey } from '../src/scrub/publish-shape.js';
import type { PublishedScrub } from '../src/shared/published.js';
import type { CatalogSource, ScrubStore } from '../src/scrub/store.js';
import { DEFAULT_STATE, type LocalState } from '../src/web/data/local.js';
import type { UserStore } from '../src/web/data/sync.js';
import { seedDigest, seedItem, seedSource, testDb } from './helpers.js';

class MemScrubs implements ScrubStore {
  scrubs = new Map<string, PublishedScrub>();
  async lastPublished() { return null; }
  async upsertScrub(s: PublishedScrub) { this.scrubs.set(s.date, s); }
  async upsertCatalog(_rows: CatalogSource[]) {}
}
class MemUser implements UserStore {
  constructor(public state: LocalState | null) {}
  async load() { return this.state && structuredClone(this.state); }
  async save(s: LocalState) { this.state = structuredClone(s); }
}

function setup() {
  const db = testDb();
  const d1 = seedDigest(db, { date: '2026-11-16', status: 'done', stage: 8 });
  const d2 = seedDigest(db, { date: '2026-11-17', status: 'done', stage: 8 });
  seedDigest(db, { date: '2026-11-18', status: 'running', stage: 3 });
  const blog = seedSource(db, { title: 'Blog', pack: 'ai-news' });
  const reddit = seedSource(db, { title: 'Reddit', feedUrl: 'https://www.reddit.com/r/x/top/.rss?t=day', type: 'community', pack: 'community' });
  const story = (digestId: number, src: number, url: string, topic: 'ai' | 'security' = 'ai') => {
    const s = db.insert(stories).values({ digestId, title: url, score: 7, category: 'tool', topic }).returning().get();
    db.insert(storyItems).values({ storyId: s.id, itemId: seedItem(db, src, { url }).id }).run();
    return s;
  };
  const a = story(d1.id, blog.id, 'https://a.dev/1');
  const b = story(d2.id, blog.id, 'https://b.dev/2', 'security');
  const r = story(d2.id, reddit.id, 'https://www.reddit.com/r/x/comments/9/t/');
  db.insert(favorites).values([{ storyId: a.id, createdAt: 10 }, { storyId: r.id, createdAt: 11 }]).run();
  db.insert(favoriteTags).values([{ storyId: a.id, tag: 'dbs' }, { storyId: a.id, tag: 'later' }]).run();
  db.insert(feedback).values({ storyId: b.id, kind: 'less_like_this', createdAt: 12 }).run();
  db.insert(reads).values({ date: '2026-11-17', finishedAt: 99, quizCorrect: 2, quizTotal: 3 }).run();
  return { db, blog };
}

const remote = () => ({ ...structuredClone(DEFAULT_STATE), onboarded: true, topics: ['infra' as const], updatedAt: 5 });

test('publishes finished digests and merges favorites, tags, feedback and reads; returns counts', async () => {
  const { db, blog } = setup();
  const scrubs = new MemScrubs();
  const user = new MemUser(remote());
  const counts = await importLocal({ db, scrubStore: scrubs, userStore: user });
  expect(counts).toEqual({ scrubs: 2, stories: 2, favorites: 1, tags: 2, feedback: 1, reads: 1, skipped: 1 });
  expect([...scrubs.scrubs.keys()].sort()).toEqual(['2026-11-16', '2026-11-17']);
  expect(JSON.stringify([...scrubs.scrubs.values()])).not.toContain('reddit.com');
  expect(user.state!.favorites).toEqual([{ key: storyKey('https://a.dev/1'), createdAt: 10, tags: ['dbs', 'later'] }]);
  expect(user.state!.feedback).toEqual([{ key: storyKey('https://b.dev/2'), kind: 'less_like_this', createdAt: 12, topic: 'security', sourceKey: expect.any(String) }]);
  expect(user.state!.feedback[0]!.sourceKey).toHaveLength(16);
  expect(user.state!.reads).toEqual([{ date: '2026-11-17', finishedAt: 99, quizCorrect: 2, quizTotal: 3 }]);
  // the remote settings are kept
  expect(user.state!.topics).toEqual(['infra']);
  void blog;
});

test('a second run changes nothing', async () => {
  const { db } = setup();
  const scrubs = new MemScrubs();
  const user = new MemUser(remote());
  await importLocal({ db, scrubStore: scrubs, userStore: user });
  const once = structuredClone(user.state);
  await importLocal({ db, scrubStore: scrubs, userStore: user });
  expect(user.state).toEqual(once);
});

test('a user with no synced settings is refused: sign in on the site first', async () => {
  const { db } = setup();
  await expect(importLocal({ db, scrubStore: new MemScrubs(), userStore: new MemUser(null) })).rejects.toThrow(/sign in/i);
});

test('the local database file is byte-identical after an import', async () => {
  const { db } = setup();
  const file = db.$client.name;
  db.$client.pragma('wal_checkpoint(TRUNCATE)');
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const before = hash();
  await importLocal({ db, scrubStore: new MemScrubs(), userStore: new MemUser(remote()) });
  db.$client.pragma('wal_checkpoint(TRUNCATE)');
  expect(hash()).toBe(before);
});
