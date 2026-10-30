const DROP_PARAMS = new Set(['ref', 'ref_src', 'source', 'fbclid', 'gclid']);
const dropParam = (k: string) => DROP_PARAMS.has(k) || k.startsWith('utm_') || k.startsWith('mc_');

export function canonicalUrl(u: string): string {
  const url = new URL(u);
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  const params = [...url.searchParams].filter(([k]) => !dropParam(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(params).toString();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}
