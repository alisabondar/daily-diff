import { readFileSync } from 'node:fs';
import type { Source } from '../src/sources/types.js';

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** A fetchFn that serves fixed bodies by exact URL (or URL prefix ending in `*`), recording every call. */
export function fakeFetch(routes: Record<string, string | number | (() => Promise<Response>)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => (k.endsWith('*') ? url.startsWith(k.slice(0, -1)) : k === url));
    if (key === undefined) return new Response('not found', { status: 404 });
    const r = routes[key]!;
    if (typeof r === 'function') return r();
    if (typeof r === 'number') return new Response('', { status: r });
    return new Response(r, { status: 200 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

export function source(over: Partial<Source> = {}): Source {
  return {
    id: 1, kind: 'rss', type: 'blog', title: 'Src', url: 'https://src.dev', feedUrl: 'https://src.dev/feed',
    hnTags: null, pack: null, enabled: true, lastFetchedAt: null, lastStatus: null, lastError: null, createdAt: 0,
    ...over,
  };
}
