import type { Llm } from '../llm/types.js';
import { SuggestSchema, suggestPrompt, suggestSystem } from '../prompts/suggest.js';
import { isSafePublicUrl } from './text.js';

export interface Suggestion { title: string; siteUrl: string; why: string }

const MAX = 6;

/** `www.example.com` → `example.com`; null for anything that isn't a URL (e.g. `hn:front_page`). */
function host(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Step 30: the model proposes sources for the profile. Makes no fetch; only the LLM is called. */
export async function suggestSources(input: { profile: string; existing: { title: string; url: string; feedUrl: string }[] }, llm: Llm): Promise<Suggestion[]> {
  const { data } = await llm.json({
    tier: 'strong', task: 'suggest', schema: SuggestSchema,
    system: suggestSystem(input.profile), prompt: suggestPrompt(input.existing),
  });
  const seen = new Set(input.existing.flatMap((s) => [host(s.url), host(s.feedUrl)]).filter((h) => h !== null));
  const out: Suggestion[] = [];
  for (const s of data.suggestions) {
    const h = host(s.siteUrl);
    if (!h || !isSafePublicUrl(s.siteUrl) || seen.has(h)) continue;
    seen.add(h);
    out.push({ title: s.title, siteUrl: s.siteUrl, why: s.why });
  }
  return out.slice(0, MAX);
}
