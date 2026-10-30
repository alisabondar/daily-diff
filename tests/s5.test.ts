import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { digests, stories, storyItems } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runS5 } from '../src/pipeline/s5-enrich.js';
import { ctx, fakeFetch, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

const hnItem = (texts: string[]) => JSON.stringify({ children: texts.map((text) => ({ text })) });
const redditJson = (bodies: string[]) => JSON.stringify([{ data: { children: [] } }, { data: { children: bodies.map((body) => ({ kind: 't1', data: { body } })) } }]);

function setup() {
  const db = testDb();
  const d = seedDigest(db, { stage: 4 });
  const src = seedSource(db);
  const story = (s: { category: 'model' | 'tool' | 'headline'; score: number }, items: Parameters<typeof seedItem>[2][]) => {
    const row = db.insert(stories).values({ digestId: d.id, title: 'T', ...s }).returning().get();
    for (const over of items) db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, src.id, over).id }).run();
    return row;
  };
  const community = (id: number) => db.select().from(stories).where(eq(stories.id, id)).get()!.community;
  return { db, story, community };
}

const noLlm = new FakeLlm({});

test('HN path: an item with an hnId uses its comments', async () => {
  const { db, story, community } = setup();
  const s = story({ category: 'headline', score: 8 }, [{ hnId: 42 }]);
  const fetchFn = fakeFetch({ 'https://hn.algolia.com/api/v1/items/42': hnItem(['Nice', 'Meh']) });
  await runS5(ctx(db, noLlm, { fetchFn }));
  expect(community(s.id)).toBe('Nice\n---\nMeh');
  expect(db.select().from(digests).get()!.stage).toBe(5);
  expect(noLlm.calls).toEqual([]);
});

test('search-by-URL path for model stories without an hnId', async () => {
  const { db, story, community } = setup();
  const s = story({ category: 'model', score: 2 }, [{ url: 'https://lab.dev/model' }]);
  const fetchFn = fakeFetch({
    'https://hn.algolia.com/api/v1/search?*': JSON.stringify({ hits: [{ objectID: '77' }] }),
    'https://hn.algolia.com/api/v1/items/77': hnItem(['Benchmarks look real']),
  });
  await runS5(ctx(db, noLlm, { fetchFn }));
  expect(community(s.id)).toBe('Benchmarks look real');
  expect(new URL(fetchFn.calls[0]!.url).searchParams.get('query')).toBe('https://lab.dev/model');
});

test('non-model stories without an hnId never search HN', async () => {
  const { db, story, community } = setup();
  const s = story({ category: 'tool', score: 9 }, [{}]);
  const fetchFn = fakeFetch({});
  await runS5(ctx(db, noLlm, { fetchFn }));
  expect(fetchFn.calls).toEqual([]);
  expect(community(s.id)).toBeNull();
});

test('Reddit comments are appended; Reddit returning null is tolerated', async () => {
  const { db, story, community } = setup();
  const thread = 'https://www.reddit.com/r/LocalLLaMA/comments/abc/x/';
  const ok = story({ category: 'model', score: 9 }, [{ hnId: 1 }, { discussionUrl: thread }]);
  const blocked = story({ category: 'model', score: 9 }, [{ hnId: 2, discussionUrl: 'https://www.reddit.com/r/x/comments/zzz/y/' }]);
  const fetchFn = fakeFetch({
    'https://hn.algolia.com/api/v1/items/1': hnItem(['HN take']),
    'https://hn.algolia.com/api/v1/items/2': hnItem(['Other HN take']),
    [`${thread}.json?limit=20&sort=top`]: redditJson(['Reddit take']),
    'https://www.reddit.com/r/x/*': 403,
  });
  await runS5(ctx(db, noLlm, { fetchFn }));
  expect(community(ok.id)).toBe('HN take\n---\nReddit take');
  expect(community(blocked.id)).toBe('Other HN take');
});

test('HN network failures do not fail the stage', async () => {
  const { db, story, community } = setup();
  const s = story({ category: 'model', score: 9 }, [{ hnId: 5 }]);
  await runS5(ctx(db, noLlm, { fetchFn: fakeFetch({ 'https://hn.algolia.com/*': 500 }) }));
  expect(community(s.id)).toBeNull();
  expect(db.select().from(digests).get()!.stage).toBe(5);
});

test('non-targets are untouched: below threshold, or outside the top 15', async () => {
  const { db, story, community } = setup();
  const low = story({ category: 'headline', score: 4 }, [{ hnId: 900 }]);
  const top = Array.from({ length: 16 }, (_, i) => story({ category: 'headline', score: i === 15 ? 5 : 9 }, [{ hnId: 1000 + i }]));
  const fetchFn = fakeFetch({ 'https://hn.algolia.com/api/v1/items/*': hnItem(['c']) });
  await runS5(ctx(db, noLlm, { fetchFn }));
  expect(community(low.id)).toBeNull();
  expect(community(top[15]!.id)).toBeNull();
  expect(top.slice(0, 15).every((s) => community(s.id) === 'c')).toBe(true);
  expect(fetchFn.calls.some((c) => c.url.endsWith('/items/900'))).toBe(false);
});
