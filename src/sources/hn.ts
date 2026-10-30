import { fetchWithTimeout, stripHtml, truncate } from './text.js';
import type { FetchOpts, RawItem, Source } from './types.js';

const API = 'https://hn.algolia.com/api/v1';
const itemPage = (id: string | number) => `https://news.ycombinator.com/item?id=${id}`;

interface Hit { objectID: string; title: string; url: string | null; author: string | null; created_at_i: number; story_text: string | null }

async function getJson<T>(url: string, { fetchFn, timeoutMs = 10_000 }: FetchOpts): Promise<T> {
  return (await (await fetchWithTimeout(url, { fetchFn, timeoutMs })).json()) as T;
}

export async function fetchHn(source: Source, since: number, opts: FetchOpts = {}): Promise<RawItem[]> {
  const q = new URLSearchParams({
    tags: source.hnTags ?? 'front_page',
    numericFilters: `created_at_i>=${Math.floor(since / 1000)},points>=50`,
    hitsPerPage: '100',
  });
  const { hits } = await getJson<{ hits: Hit[] }>(`${API}/search_by_date?${q}`, opts);
  return hits.map((h) => {
    const text = stripHtml(h.story_text ?? '');
    return {
      sourceId: source.id,
      url: h.url ?? itemPage(h.objectID),
      title: h.title,
      author: h.author,
      excerpt: truncate(text, 1000),
      content: truncate(text, 6000),
      mediaUrl: null,
      discussionUrl: itemPage(h.objectID),
      hnId: Number(h.objectID),
      publishedAt: h.created_at_i * 1000,
    };
  });
}

export async function hnComments(hnId: number, opts: FetchOpts = {}): Promise<string> {
  const item = await getJson<{ children?: { text: string | null }[] }>(`${API}/items/${hnId}`, opts);
  const texts = (item.children ?? []).slice(0, 20).map((c) => stripHtml(c.text ?? '')).filter(Boolean);
  return truncate(texts.join('\n---\n'), 4000);
}

export async function hnSearchByUrl(url: string, opts: FetchOpts = {}): Promise<number | null> {
  const q = new URLSearchParams({ query: url, restrictSearchableAttributes: 'url', hitsPerPage: '1' });
  const { hits } = await getJson<{ hits: { objectID: string }[] }>(`${API}/search?${q}`, opts);
  return hits[0] ? Number(hits[0].objectID) : null;
}
