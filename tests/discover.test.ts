import { expect, test } from 'vitest';
import { discoverFeed } from '../src/sources/discover.js';
import { fakeFetch, fixture } from './helpers.js';

test('a direct feed URL is confirmed and previewed', async () => {
  const fetchFn = fakeFetch({ 'https://blog.example.com/feed.xml': fixture('feeds/blog-rss2.xml') });
  const res = await discoverFeed('https://blog.example.com/feed.xml', { fetchFn });
  expect(res).toEqual({
    found: true,
    feedUrl: 'https://blog.example.com/feed.xml',
    title: 'Example Blog',
    suggestedType: 'blog',
    preview: [
      { title: 'Shipping & scaling', url: 'https://blog.example.com/posts/shipping/?utm_source=rss', publishedAt: Date.parse('2026-10-28T10:00:00Z') },
      { title: 'Old post', url: 'https://blog.example.com/posts/old/', publishedAt: Date.parse('2026-10-20T10:00:00Z') },
      { title: 'Undated post', url: 'https://blog.example.com/posts/undated/', publishedAt: null },
    ],
  });
});

test('a link tag with a relative href is resolved against the page', async () => {
  const fetchFn = fakeFetch({
    'https://site.dev/posts/hello': fixture('html/link-tag.html'),
    'https://site.dev/blog/index.xml': fixture('feeds/blog-atom.xml'),
  });
  expect(await discoverFeed('https://site.dev/posts/hello', { fetchFn })).toMatchObject({ found: true, feedUrl: 'https://site.dev/blog/index.xml', title: 'Atom Blog' });
});

test('candidate paths are tried in order when the page has no link tag', async () => {
  const fetchFn = fakeFetch({
    'https://plain.dev/': fixture('html/no-feed.html'),
    'https://plain.dev/atom.xml': fixture('feeds/blog-atom.xml'),
  });
  const res = await discoverFeed('https://plain.dev/', { fetchFn });
  expect(res).toMatchObject({ found: true, feedUrl: 'https://plain.dev/atom.xml' });
  expect(fetchFn.calls.map((c) => c.url)).toEqual([
    'https://plain.dev/', 'https://plain.dev/feed', 'https://plain.dev/rss', 'https://plain.dev/feed.xml', 'https://plain.dev/atom.xml', 'https://plain.dev/atom.xml',
  ].slice(0, fetchFn.calls.length));
  expect(fetchFn.calls.map((c) => c.url)).toContain('https://plain.dev/atom.xml');
  expect(fetchFn.calls.map((c) => c.url)).not.toContain('https://plain.dev/index.xml');
});

test('Substack: *.substack.com is rewritten to /feed without fetching the page', async () => {
  const fetchFn = fakeFetch({ 'https://writer.substack.com/feed': fixture('feeds/blog-rss2.xml') });
  expect(await discoverFeed('https://writer.substack.com/p/some-post', { fetchFn })).toMatchObject({ found: true, feedUrl: 'https://writer.substack.com/feed' });
  expect(fetchFn.calls.map((c) => c.url)).toEqual(['https://writer.substack.com/feed']);
});

test('Substack on a custom domain is detected by its markers', async () => {
  const fetchFn = fakeFetch({ 'https://news.dev/about': fixture('html/substack-custom-domain.html'), 'https://news.dev/feed': fixture('feeds/blog-rss2.xml') });
  expect(await discoverFeed('https://news.dev/about', { fetchFn })).toMatchObject({ found: true, feedUrl: 'https://news.dev/feed' });
});

test('Medium profile URLs are rewritten', async () => {
  const fetchFn = fakeFetch({ 'https://medium.com/feed/@someone': fixture('feeds/blog-rss2.xml') });
  expect(await discoverFeed('https://medium.com/@someone', { fetchFn })).toMatchObject({ found: true, feedUrl: 'https://medium.com/feed/@someone' });
});

test('a YouTube channel id URL becomes the channel feed, suggested as video', async () => {
  const feed = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCexample123';
  const fetchFn = fakeFetch({ [feed]: fixture('feeds/youtube.xml') });
  expect(await discoverFeed('https://www.youtube.com/channel/UCexample123', { fetchFn })).toMatchObject({ found: true, feedUrl: feed, suggestedType: 'video', title: 'Example Channel' });
});

test('a YouTube @handle page is scanned for its channelId', async () => {
  const feed = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCexample123';
  const fetchFn = fakeFetch({ 'https://www.youtube.com/@example': fixture('html/youtube-handle.html'), [feed]: fixture('feeds/youtube.xml') });
  expect(await discoverFeed('https://www.youtube.com/@example', { fetchFn })).toMatchObject({ found: true, feedUrl: feed, suggestedType: 'video' });
});

test('a YouTube @handle page uses its own externalId, not a related channel\'s channelId', async () => {
  const own = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCowner000000000000000A';
  const other = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCother000000000000000B';
  const fetchFn = fakeFetch({ 'https://www.youtube.com/@example': fixture('html/youtube-handle-related.html'), [own]: fixture('feeds/youtube.xml'), [other]: fixture('feeds/youtube.xml') });
  expect(await discoverFeed('https://www.youtube.com/@example', { fetchFn })).toMatchObject({ found: true, feedUrl: own });
});

test('a podcast feed is suggested as podcast', async () => {
  const fetchFn = fakeFetch({ 'https://pod.dev/rss': fixture('feeds/podcast.xml') });
  expect(await discoverFeed('https://pod.dev/rss', { fetchFn })).toMatchObject({ found: true, suggestedType: 'podcast' });
});

test('not found: a reason is returned', async () => {
  const fetchFn = fakeFetch({ 'https://plain.dev/': fixture('html/no-feed.html') });
  const res = await discoverFeed('https://plain.dev/', { fetchFn });
  expect(res.found).toBe(false);
  expect(res).toHaveProperty('reason', expect.stringMatching(/no rss or atom feed/i));
  expect(fetchFn.calls.map((c) => c.url)).toEqual([
    'https://plain.dev/', 'https://plain.dev/feed', 'https://plain.dev/rss', 'https://plain.dev/feed.xml', 'https://plain.dev/atom.xml', 'https://plain.dev/index.xml', 'https://plain.dev/rss.xml',
  ]);
});

test('an unreachable page or invalid URL is reported, not thrown', async () => {
  expect(await discoverFeed('not a url', { fetchFn: fakeFetch({}) })).toMatchObject({ found: false });
  expect(await discoverFeed('https://down.dev/', { fetchFn: fakeFetch({ 'https://down.dev/': 503 }) })).toMatchObject({ found: false });
});
