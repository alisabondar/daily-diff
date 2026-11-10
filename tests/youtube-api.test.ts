import { expect, test } from 'vitest';
import { fetchYoutubeApi, youtubeChannelId } from '../src/sources/youtube-api.js';
import { fakeFetch, source } from './helpers.js';

const since = Date.parse('2026-10-28T00:00:00Z');
const KEY = 'test-yt-key';
const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc';
const CHANNELS = 'https://www.googleapis.com/youtube/v3/channels?*';
const PLAYLIST = 'https://www.googleapis.com/youtube/v3/playlistItems?*';
const channels = JSON.stringify({ items: [{ id: 'UCabc', contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] });
const item = (videoId: string, title: string, publishedAt: string) => ({
  snippet: { title, description: `About ${title}.`, channelTitle: 'Demo Channel', resourceId: { kind: 'youtube#video', videoId } },
  contentDetails: { videoId, videoPublishedAt: publishedAt },
});
const playlist = JSON.stringify({
  items: [item('v1', 'New video', '2026-10-28T12:00:00Z'), item('v0', 'Old video', '2026-10-01T12:00:00Z')],
});

test('youtubeChannelId reads the channel id from a channel feed URL', () => {
  expect(youtubeChannelId(feedUrl)).toBe('UCabc');
  expect(youtubeChannelId('https://www.youtube.com/feeds/videos.xml?playlist_id=PLx')).toBeNull();
  expect(youtubeChannelId('https://blog.dev/feed')).toBeNull();
});

test('fetchYoutubeApi lists the uploads playlist, maps videos and drops old ones', async () => {
  const f = fakeFetch({ [CHANNELS]: channels, [PLAYLIST]: playlist });
  const out = await fetchYoutubeApi(source({ id: 7, feedUrl, type: 'video' }), since, { fetchFn: f, apiKey: KEY });
  expect(out).toEqual([{
    sourceId: 7,
    url: 'https://www.youtube.com/watch?v=v1',
    title: 'New video',
    author: 'Demo Channel',
    excerpt: 'About New video.',
    content: 'About New video.',
    mediaUrl: null,
    discussionUrl: null,
    hnId: null,
    publishedAt: Date.parse('2026-10-28T12:00:00Z'),
  }]);
  const [c, p] = f.calls;
  expect(new URL(c!.url).searchParams.get('id')).toBe('UCabc');
  expect(new URL(p!.url).searchParams.get('playlistId')).toBe('UUabc');
});

test('the key is sent as a header and never appears in a URL', async () => {
  const f = fakeFetch({ [CHANNELS]: channels, [PLAYLIST]: playlist });
  await fetchYoutubeApi(source({ feedUrl }), since, { fetchFn: f, apiKey: KEY });
  expect(f.calls).toHaveLength(2);
  for (const c of f.calls) {
    expect(c.url).not.toContain(KEY);
    expect((c.init?.headers as Record<string, string>)['X-Goog-Api-Key']).toBe(KEY);
  }
});

test('an API error rejects with the status and no key', async () => {
  const f = fakeFetch({ [CHANNELS]: 403 });
  const err = await fetchYoutubeApi(source({ feedUrl }), since, { fetchFn: f, apiKey: KEY }).catch((e: Error) => e);
  expect((err as Error).message).toMatch(/HTTP 403/);
  expect((err as Error).message).not.toContain(KEY);
});

test('an unknown channel rejects as not found', async () => {
  const f = fakeFetch({ [CHANNELS]: JSON.stringify({ items: [] }) });
  await expect(fetchYoutubeApi(source({ feedUrl }), since, { fetchFn: f, apiKey: KEY })).rejects.toThrow(/not found/i);
});
