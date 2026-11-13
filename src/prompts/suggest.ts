import { z } from 'zod';

export const SuggestSchema = z.object({
  suggestions: z.array(z.object({ title: z.string(), siteUrl: z.string(), why: z.string() })).max(8),
});

export function suggestSystem(profile: string): string {
  return `You recommend news sources for a reader's daily tech briefing.
The reader's profile:
"""
${profile.trim()}
"""
Rules:
- Suggest up to 8 well-known publications, blogs, newsletters or podcasts that cover the reader's industry or interests and that publish an RSS or Atom feed.
- siteUrl is the source's home page (https), not a guessed feed URL.
- why is one sentence of at most 120 characters, tied to the reader's profile.
- Do not suggest any source the reader already has.
Respond with JSON matching the schema.`;
}

export function suggestPrompt(existing: { title: string; url: string }[]): string {
  return `Sources the reader already has (title | url):\n${existing.map((s) => `${s.title} | ${s.url}`).join('\n') || '(none)'}`;
}
