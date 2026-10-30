import { expect, test } from 'vitest';
import { fetchHn, hnComments, hnSearchByUrl } from '../src/sources/hn.js';
import { canonicalUrl } from '../src/sources/normalize.js';
import { redditComments } from '../src/sources/reddit.js';
import { fetchRss } from '../src/sources/rss.js';
import { stripHtml, truncate } from '../src/sources/text.js';
import { fakeFetch, fixture, source } from './helpers.js';

const since = Date.parse('2026-10-28T00:00:00Z');

test.each([
  ['https://WWW.Example.com/a/', 'https://example.com/a'],
  ['http://example.com/a', 'https://example.com/a'],
  ['https://example.com/', 'https://example.com/'],
  ['https://example.com', 'https://example.com/'],
  ['https://example.com/a#section', 'https://example.com/a'],
  ['https://example.com/a?utm_source=x&utm_medium=y', 'https://example.com/a'],
  ['https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2'],
  ['https://example.com/a?ref=hn&id=3', 'https://example.com/a?id=3'],
  ['https://example.com/a?ref_src=tw&source=rss&fbclid=1&gclid=2', 'https://example.com/a'],
  ['https://example.com/a?mc_cid=1&mc_eid=2&q=x', 'https://example.com/a?q=x'],
  ['https://sub.example.com/Path/Case/', 'https://sub.example.com/Path/Case'],
])('canonicalUrl(%s)', (input, expected) => {
  expect(canonicalUrl(input)).toBe(expected);
});

test('stripHtml removes tags, scripts and styles and decodes entities', () => {
  expect(stripHtml('<p>Hi&nbsp;&amp; <b>bye</b></p><script>x()</script><style>p{}</style>  &lt;3 &quot;q&quot; &#39;s&#39; &#65;&#x42;'))
    .toBe('Hi & bye <3 "q" \'s\' AB');
});

test('truncate cuts on a word boundary and adds an ellipsis', () => {
  expect(truncate('hello brave new world', 13)).toBe('hello brave…');
  expect(truncate('short', 10)).toBe('short');
});

test('RSS 2.0 blog maps fields and applies the since filter', async () => {
  const items = await fetchRss(source(), since, { fetchFn: fakeFetch({ 'https://src.dev/feed': fixture('feeds/blog-rss2.xml') }) });
  expect(items.map((i) => i.title)).toEqual(['Shipping & scaling', 'Undated post']);
  expect(items[0]).toMatchObject({
    sourceId: 1, url: 'https://blog.example.com/posts/shipping/?utm_source=rss', author: 'Ada Lovelace',
    excerpt: 'We shipped v2 today.', content: 'We shipped v2 today.', mediaUrl: null, discussionUrl: null,
    publishedAt: Date.parse('2026-10-28T10:00:00Z'),
  });
  expect(items[1]!.publishedAt).toBeNull();
});

test('since filter keeps a 48h grace window', async () => {
  const items = await fetchRss(source(), Date.parse('2026-10-22T00:00:00Z'), { fetchFn: fakeFetch({ 'https://src.dev/feed': fixture('feeds/blog-rss2.xml') }) });
  expect(items.map((i) => i.title)).toContain('Old post');
});

test('Atom blog maps author and summary', async () => {
  const [item] = await fetchRss(source(), since, { fetchFn: fakeFetch({ 'https://src.dev/feed': fixture('feeds/blog-atom.xml') }) });
  expect(item).toMatchObject({ url: 'https://atom.example.org/2026/caching', title: 'Notes on caching', author: 'Grace Hopper', excerpt: 'Caches are hard.' });
});

test('podcast enclosure becomes mediaUrl', async () => {
  const [item] = await fetchRss(source({ type: 'podcast' }), since, { fetchFn: fakeFetch({ 'https://src.dev/feed': fixture('feeds/podcast.xml') }) });
  expect(item).toMatchObject({ url: 'https://pod.example.com/42', mediaUrl: 'https://cdn.example.com/ep42.mp3', excerpt: 'We talk about agents.' });
});

test('YouTube Atom maps the watch link and date', async () => {
  const [item] = await fetchRss(source({ type: 'video' }), since, { fetchFn: fakeFetch({ 'https://src.dev/feed': fixture('feeds/youtube.xml') }) });
  expect(item).toMatchObject({ url: 'https://www.youtube.com/watch?v=abc123', title: 'Demo: new model', publishedAt: Date.parse('2026-10-28T15:00:00Z') });
});

test('Reddit feed sets discussionUrl to the item link', async () => {
  const feedUrl = 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day';
  const [item] = await fetchRss(source({ feedUrl, type: 'community' }), since, { fetchFn: fakeFetch({ [feedUrl]: fixture('feeds/reddit.xml') }) });
  expect(item).toMatchObject({
    url: 'https://www.reddit.com/r/LocalLLaMA/comments/xyz/new_local_model/',
    discussionUrl: 'https://www.reddit.com/r/LocalLLaMA/comments/xyz/new_local_model/',
    excerpt: 'Benchmarks inside',
  });
});

test('a timeout rejects with a clear message', async () => {
  const hang = (async (_: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
  await expect(fetchRss(source(), since, { fetchFn: hang, timeoutMs: 20 })).rejects.toThrow(/timed out after 20ms/);
});

test('an HTTP error rejects with the status', async () => {
  await expect(fetchRss(source(), since, { fetchFn: fakeFetch({ 'https://src.dev/feed': 503 }) })).rejects.toThrow(/503/);
});

test('fetchHn builds the Algolia query and maps hits', async () => {
  const f = fakeFetch({ 'https://hn.algolia.com/api/v1/search_by_date*': fixture('hn/search.json') });
  const items = await fetchHn(source({ kind: 'hn', hnTags: 'show_hn', feedUrl: 'hn:show_hn' }), since, { fetchFn: f });
  const q = new URL(f.calls[0]!.url).searchParams;
  expect(q.get('tags')).toBe('show_hn');
  expect(q.get('numericFilters')).toBe(`created_at_i>=${since / 1000},points>=50`);
  expect(q.get('hitsPerPage')).toBe('100');
  expect(items[0]).toMatchObject({ url: 'https://tinydb.dev/?ref=hn', title: 'Show HN: Tiny DB', hnId: 4001, discussionUrl: 'https://news.ycombinator.com/item?id=4001', author: 'pg', publishedAt: 1792922400000 });
  expect(items[1]).toMatchObject({ url: 'https://news.ycombinator.com/item?id=4002', excerpt: 'Tell us & share' });
});

test('hnComments joins stripped top-level comments', async () => {
  const f = fakeFetch({ 'https://hn.algolia.com/api/v1/items/4001': fixture('hn/item.json') });
  expect(await hnComments(4001, { fetchFn: f })).toBe('Great & fast\n---\nNeeds docs');
});

test('hnSearchByUrl returns the first hit id or null', async () => {
  const f = fakeFetch({ 'https://hn.algolia.com/api/v1/search?*': fixture('hn/search-by-url.json') });
  expect(await hnSearchByUrl('https://model.example.com/launch', { fetchFn: f })).toBe(5005);
  const q = new URL(f.calls[0]!.url).searchParams;
  expect(q.get('query')).toBe('https://model.example.com/launch');
  expect(q.get('restrictSearchableAttributes')).toBe('url');
  expect(await hnSearchByUrl('x', { fetchFn: fakeFetch({ 'https://hn.algolia.com/*': '{"hits":[]}' }) })).toBeNull();
});

const redditJson = JSON.stringify([
  { data: { children: [{ kind: 't3', data: { title: 'post' } }] } },
  { data: { children: [{ kind: 't1', data: { body: 'First!' } }, { kind: 't1', data: { body: 'Second' } }, { kind: 'more', data: {} }] } },
]);

test('redditComments fetches top comments with a User-Agent', async () => {
  const url = 'https://www.reddit.com/r/LocalLLaMA/comments/xyz/new_local_model/';
  const f = fakeFetch({ [`${url}.json?limit=20&sort=top`]: redditJson });
  expect(await redditComments(url, { fetchFn: f, version: '1.2.3' })).toBe('First!\n---\nSecond');
  expect(new Headers(f.calls[0]!.init?.headers).get('User-Agent')).toBe('daily-diff/1.2.3');
});

test('redditComments returns null on a 403 and on a network error', async () => {
  expect(await redditComments('https://www.reddit.com/r/x/comments/1/', { fetchFn: fakeFetch({ 'https://www.reddit.com/*': 403 }) })).toBeNull();
  const boom = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  expect(await redditComments('https://www.reddit.com/r/x/comments/1/', { fetchFn: boom })).toBeNull();
});
