const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

export function stripHtml(s: string): string {
  return s
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|#39|nbsp);/gi, (m, e: string) => {
      const lower = e.toLowerCase();
      if (lower in ENTITIES) return ENTITIES[lower]!;
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** fetch with a timeout; non-2xx responses and timeouts reject with a readable message. */
export async function fetchWithTimeout(url: string, opts: { fetchFn?: typeof fetch; timeoutMs: number; headers?: Record<string, string> }): Promise<Response> {
  const { fetchFn = fetch, timeoutMs, headers } = opts;
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError') throw new Error(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms`);
    throw err;
  }
  if (!res.ok) throw new Error(`Request to ${new URL(url).host} failed: HTTP ${res.status}`);
  return res;
}
