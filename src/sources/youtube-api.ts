import { fetchWithTimeout, truncate } from './text.js';
import type { FetchOpts, RawItem, Source } from './types.js';

const API = 'https://www.googleapis.com/youtube/v3';
const GRACE_MS = 48 * 3600_000;

interface PlaylistItem {
  snippet: { title: string; description: string; channelTitle: string };
  contentDetails: { videoId: string; videoPublishedAt?: string };
}

/** The UC… channel id from a YouTube channel feed URL, else null. */
export function youtubeChannelId(feedUrl: string): string | null {
  const url = URL.parse(feedUrl);
  if (url?.hostname !== 'www.youtube.com' || url.pathname !== '/feeds/videos.xml') return null;
  return url.searchParams.get('channel_id');
}

/** A channel's recent uploads via the YouTube Data API v3 (key sent as a header, never in the URL). */
export async function fetchYoutubeApi(source: Source, since: number, { fetchFn, timeoutMs = 10_000, apiKey }: FetchOpts & { apiKey: string }): Promise<RawItem[]> {
  const get = async <T>(path: string, params: Record<string, string>): Promise<T> => {
    const res = await fetchWithTimeout(`${API}/${path}?${new URLSearchParams(params)}`, { fetchFn, timeoutMs, headers: { 'X-Goog-Api-Key': apiKey } });
    return (await res.json()) as T;
  };
  const id = youtubeChannelId(source.feedUrl);
  if (!id) throw new Error('Not a YouTube channel feed');
  const channels = await get<{ items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>('channels', { part: 'contentDetails', id });
  const uploads = channels.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploads) throw new Error(`YouTube channel ${id} not found`);
  const list = await get<{ items?: PlaylistItem[] }>('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: '50' });
  const out: RawItem[] = [];
  for (const { snippet, contentDetails } of list.items ?? []) {
    const publishedAt = contentDetails.videoPublishedAt ? Date.parse(contentDetails.videoPublishedAt) : NaN;
    if (!Number.isNaN(publishedAt) && publishedAt < since - GRACE_MS) continue;
    out.push({
      sourceId: source.id,
      url: `https://www.youtube.com/watch?v=${contentDetails.videoId}`,
      title: snippet.title,
      author: snippet.channelTitle,
      excerpt: truncate(snippet.description, 1000),
      content: truncate(snippet.description, 6000),
      mediaUrl: null,
      discussionUrl: null,
      hnId: null,
      publishedAt: Number.isNaN(publishedAt) ? null : publishedAt,
    });
  }
  return out;
}
