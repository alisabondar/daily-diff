import { fetchWithTimeout, truncate } from './text.js';
import type { FetchOpts } from './types.js';

interface Listing { data: { children: { kind: string; data: { body?: string } }[] } }

/** Best-effort: any failure (403, network, bad JSON) returns null. */
export async function redditComments(permalinkUrl: string, { fetchFn, version = '0.0.0' }: FetchOpts & { version?: string } = {}): Promise<string | null> {
  try {
    const url = `${permalinkUrl.replace(/\/?$/, '/')}.json?limit=20&sort=top`;
    const res = await fetchWithTimeout(url, { fetchFn, timeoutMs: 5000, headers: { 'User-Agent': `daily-diff/${version}` } });
    const [, comments] = (await res.json()) as Listing[];
    const bodies = (comments?.data.children ?? []).filter((c) => c.kind === 't1' && c.data.body).map((c) => c.data.body!.trim());
    return truncate(bodies.join('\n---\n'), 4000);
  } catch {
    return null;
  }
}
