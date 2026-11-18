import { expect, test } from 'vitest';
import { learnItems, stories, storyItems } from '../src/db/schema.js';
import { storyKey, toPublished } from '../src/scrub/publish-shape.js';
import { seedDigest, seedItem, seedSource, testDb } from './helpers.js';

const STORY_FIELDS = ['key', 'date', 'title', 'links', 'sourceIds', 'pack', 'category', 'topic', 'score', 'summary', 'stats', 'pros', 'cons', 'readMinutes', 'publishedAt'].sort();
const LINK_FIELDS = ['url', 'sourceId', 'sourceTitle', 'discussionUrl', 'mediaUrl'].sort();

test('storyKey is 16 hex chars and stable across tracking params and www.', () => {
  const a = storyKey('https://www.example.com/post?utm_source=x');
  expect(a).toMatch(/^[0-9a-f]{16}$/);
  expect(storyKey('https://example.com/post')).toBe(a);
  expect(storyKey('https://example.com/other')).not.toBe(a);
});

function setup() {
  const db = testDb();
  const d = seedDigest(db, { date: '2026-11-18', windowStart: 100, windowEnd: 200, status: 'done', stage: 8 });
  const blog = seedSource(db, { title: 'Lab Blog', pack: 'ai-news' });
  const reddit = seedSource(db, { title: 'Reddit', feedUrl: 'https://www.reddit.com/r/x/top/.rss?t=day', type: 'community', pack: 'community' });
  const story = (over: Partial<typeof stories.$inferInsert>, its: { src: number; over?: Parameters<typeof seedItem>[2] }[]) => {
    const row = db.insert(stories).values({ digestId: d.id, title: 'T', score: 7, category: 'tool', topic: 'ai', summary: 'Sum', pros: ['p'], cons: ['c'], community: 'COMMUNITY-SECRET', ...over }).returning().get();
    for (const it of its) db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, it.src, it.over).id }).run();
    return row;
  };
  return { db, d, blog, reddit, story };
}

test('toPublished sets exactly the published fields and leaks no content, excerpt or community text', () => {
  const { db, d, blog, story } = setup();
  story({}, [{ src: blog.id, over: { url: 'https://lab.dev/a', content: 'CONTENT-SECRET word '.repeat(500), excerpt: 'EXCERPT-SECRET', publishedAt: 150 } }]);
  const out = toPublished(db, d.id);
  expect(out).toMatchObject({ date: '2026-11-18', windowStart: 100, windowEnd: 200 });
  expect(Object.keys(out).sort()).toEqual(['date', 'learn', 'stories', 'windowEnd', 'windowStart']);
  const s = out.stories[0]!;
  expect(Object.keys(s).sort()).toEqual(STORY_FIELDS);
  expect(Object.keys(s.links[0]!).sort()).toEqual(LINK_FIELDS);
  expect(s).toMatchObject({ key: storyKey('https://lab.dev/a'), title: 'T', pack: 'ai-news', sourceIds: [blog.id], score: 7, publishedAt: 150, summary: 'Sum' });
  expect(s.readMinutes).toBeGreaterThan(1);
  const json = JSON.stringify(out);
  for (const secret of ['CONTENT-SECRET', 'EXCERPT-SECRET', 'COMMUNITY-SECRET']) expect(json).not.toContain(secret);
});

test('stories without a summary are published with summary null', () => {
  const { db, d, blog, story } = setup();
  story({ summary: null }, [{ src: blog.id }]);
  expect(toPublished(db, d.id).stories[0]!.summary).toBeNull();
});

test('learn items map relatedStoryId to the story key', () => {
  const { db, d, blog, story } = setup();
  const s = story({}, [{ src: blog.id, over: { url: 'https://lab.dev/q' } }]);
  db.insert(learnItems).values({ digestId: d.id, type: 'quickstart', title: 'QS', bodyMd: 'body', relatedStoryId: s.id, sourceRef: 'https://docs.dev' }).run();
  expect(toPublished(db, d.id).learn).toEqual([
    { position: 0, type: 'quickstart', conceptKey: null, title: 'QS', bodyMd: 'body', quiz: null, relatedStoryKey: storyKey('https://lab.dev/q'), sourceRef: 'https://docs.dev' },
  ]);
});

test('without allowReddit: a Reddit-only story is dropped', () => {
  const { db, d, reddit, story } = setup();
  story({}, [{ src: reddit.id }]);
  expect(toPublished(db, d.id).stories).toEqual([]);
});

test('without allowReddit: a mixed story loses pros, cons, Reddit links and Reddit discussion urls', () => {
  const { db, d, blog, reddit, story } = setup();
  story({ pros: ['REDDIT-COMMENT-SECRET'] }, [
    { src: blog.id, over: { url: 'https://lab.dev/m', discussionUrl: 'https://www.reddit.com/r/x/comments/1/t/' } },
    { src: reddit.id, over: { url: 'https://www.reddit.com/r/x/comments/2/t/' } },
  ]);
  const s = toPublished(db, d.id).stories[0]!;
  expect(s).toMatchObject({ pros: null, cons: null, sourceIds: [blog.id] });
  expect(s.links).toEqual([{ url: 'https://lab.dev/m', sourceId: blog.id, sourceTitle: 'Lab Blog', discussionUrl: null, mediaUrl: null }]);
  expect(JSON.stringify(s)).not.toContain('REDDIT-COMMENT-SECRET');
});

test('with allowReddit the Reddit links and pros stay', () => {
  const { db, d, blog, reddit, story } = setup();
  story({}, [{ src: blog.id }, { src: reddit.id }]);
  const s = toPublished(db, d.id, { allowReddit: true }).stories[0]!;
  expect(s.sourceIds).toEqual([blog.id, reddit.id]);
  expect(s.pros).toEqual(['p']);
});

test('a learn item pointing at a dropped Reddit-only story gets relatedStoryKey null', () => {
  const { db, d, reddit, story } = setup();
  const s = story({}, [{ src: reddit.id }]);
  db.insert(learnItems).values({ digestId: d.id, type: 'concept', conceptKey: 'k', title: 'C', bodyMd: 'b', relatedStoryId: s.id, sourceRef: 'book' }).run();
  expect(toPublished(db, d.id).learn[0]!.relatedStoryKey).toBeNull();
});
