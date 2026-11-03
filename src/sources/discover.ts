import Parser from 'rss-parser';
import type { SourceType } from '../db/schema.js';
import { fetchWithTimeout } from './text.js';

export type DiscoverResult =
  | { found: true; feedUrl: string; title: string; suggestedType: Extract<SourceType, 'blog' | 'podcast' | 'video'>; preview: { title: string; url: string; publishedAt: number | null }[] }
  | { found: false; reason: string };

const CANDIDATES = ['/feed', '/rss', '/feed.xml', '/atom.xml', '/index.xml', '/rss.xml'];
const TIMEOUT_MS = 10_000;
const NOT_FOUND = 'No RSS or Atom feed found at that address.';
const parser = new Parser();

const youtubeFeed = (channelId: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

/** Step 1: rewrites that need no fetch. */
function rewrite(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith('.substack.com')) return `${url.origin}/feed`;
  const medium = /^\/(@[^/]+)/.exec(url.pathname);
  if ((host === 'medium.com' || host === 'www.medium.com') && medium) return `https://medium.com/feed/${medium[1]}`;
  const channel = /^\/channel\/([\w-]+)/.exec(url.pathname);
  if (/(^|\.)youtube\.com$/.test(host) && channel) return youtubeFeed(channel[1]!);
  return null;
}

async function tryParse(text: string) {
  try {
    return await parser.parseString(text);
  } catch {
    return null;
  }
}

/** Step 5: fetch and parse a candidate; null when it isn't a real feed. */
async function confirm(feedUrl: string, fetchFn?: typeof fetch): Promise<DiscoverResult | null> {
  let text: string;
  try {
    text = await (await fetchWithTimeout(feedUrl, { fetchFn, timeoutMs: TIMEOUT_MS })).text();
  } catch {
    return null;
  }
  const feed = await tryParse(text);
  if (!feed) return null;
  const isYoutube = /(^|\.)youtube\.com$/.test(new URL(feedUrl).hostname);
  return {
    found: true,
    feedUrl,
    title: feed.title?.trim() || new URL(feedUrl).hostname,
    suggestedType: isYoutube ? 'video' : feed.items.some((i) => i.enclosure?.url) ? 'podcast' : 'blog',
    preview: feed.items.slice(0, 3).map((i) => {
      const date = i.isoDate ?? i.pubDate;
      const t = date ? Date.parse(date) : NaN;
      return { title: i.title ?? '', url: i.link ?? '', publishedAt: Number.isNaN(t) ? null : t };
    }),
  };
}

function linkTagFeed(html: string, pageUrl: string): string | null {
  const head = /<head[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
    if (attr('rel')?.toLowerCase().split(/\s+/).includes('alternate') && /^application\/(rss|atom)\+xml$/i.test(attr('type') ?? '') && attr('href')) {
      return new URL(attr('href')!, pageUrl).toString();
    }
  }
  return null;
}

/** Finds the RSS/Atom feed for a pasted URL. Never scrapes article content. */
export async function discoverFeed(input: string, { fetchFn }: { fetchFn?: typeof fetch } = {}): Promise<DiscoverResult> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { found: false, reason: 'That doesn’t look like a valid URL.' };
  }

  const rewritten = rewrite(url);
  if (rewritten) return (await confirm(rewritten, fetchFn)) ?? { found: false, reason: NOT_FOUND };

  let text: string;
  try {
    text = await (await fetchWithTimeout(url.toString(), { fetchFn, timeoutMs: TIMEOUT_MS })).text();
  } catch (err) {
    return { found: false, reason: `Couldn’t load that page: ${(err as Error).message}` };
  }
  if (await tryParse(text)) return (await confirm(url.toString(), fetchFn)) ?? { found: false, reason: NOT_FOUND };

  if (/(^|\.)youtube\.com$/.test(url.hostname) && url.pathname.startsWith('/@')) {
    // The page's own id is "externalId" (and the canonical link); "channelId" also appears for related channels.
    const id = (/"externalId":"(UC[\w-]+)"/.exec(text) ?? /youtube\.com\/channel\/(UC[\w-]+)/.exec(text) ?? /"channelId":"([\w-]+)"/.exec(text))?.[1];
    if (id) return (await confirm(youtubeFeed(id), fetchFn)) ?? { found: false, reason: NOT_FOUND };
  }

  const linked = linkTagFeed(text, url.toString()) ?? (text.includes('substackcdn.com') ? `${url.origin}/feed` : null);
  if (linked) {
    const res = await confirm(linked, fetchFn);
    if (res) return res;
  }

  for (const path of CANDIDATES) {
    const res = await confirm(`${url.origin}${path}`, fetchFn);
    if (res) return res;
  }
  return { found: false, reason: NOT_FOUND };
}
