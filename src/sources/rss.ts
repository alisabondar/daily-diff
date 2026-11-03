import Parser from 'rss-parser';
import { VERSION } from '../version.js';
import { fetchWithTimeout, stripHtml, truncate } from './text.js';
import type { FetchOpts, RawItem, Source } from './types.js';

const GRACE_MS = 48 * 3600_000;
const parser = new Parser();

export const isRedditFeed = (feedUrl: string) => new URL(feedUrl).hostname.endsWith('reddit.com');

export async function fetchRss(source: Source, since: number, { fetchFn, timeoutMs = 10_000 }: FetchOpts = {}): Promise<RawItem[]> {
  const isReddit = isRedditFeed(source.feedUrl);
  const res = await fetchWithTimeout(source.feedUrl, { fetchFn, timeoutMs, headers: isReddit ? { 'User-Agent': `daily-diff/${VERSION}` } : undefined });
  const feed = await parser.parseString(await res.text());
  const out: RawItem[] = [];
  for (const it of feed.items) {
    if (!it.link || !it.title) continue;
    const date = it.isoDate ?? it.pubDate;
    const publishedAt = date ? Date.parse(date) : NaN;
    if (!Number.isNaN(publishedAt) && publishedAt < since - GRACE_MS) continue;
    const text = stripHtml(it.content ?? it.contentSnippet ?? it.summary ?? '');
    out.push({
      sourceId: source.id,
      url: it.link,
      title: stripHtml(it.title),
      author: it.creator ?? (it as { author?: string }).author ?? null,
      excerpt: truncate(text, 1000),
      content: truncate(text, 6000),
      mediaUrl: it.enclosure?.url ?? null,
      discussionUrl: isReddit ? it.link : null,
      hnId: null,
      publishedAt: Number.isNaN(publishedAt) ? null : publishedAt,
    });
  }
  return out;
}
