import { z } from 'zod';
import { HighlightSection } from '../db/schema.js';
import type { Book } from '../packs/index.js';

export const ComposeSchema = z.object({
  highlights: z.array(z.object({ storyId: z.number().int(), section: HighlightSection })),
  concept: z.object({
    conceptKey: z.string(),
    title: z.string(),
    bodyMd: z.string(),
    quiz: z.array(z.object({ q: z.string(), choices: z.array(z.string()).length(4), answerIndex: z.number().int().min(0).max(3) })).length(3),
    relatedStoryId: z.number().int(),
    sourceRef: z.string(),
  }),
  quickstartTarget: z.object({ storyId: z.number().int(), name: z.string(), docsUrl: z.string().nullable() }),
});
export type ComposeOutput = z.infer<typeof ComposeSchema>;


export function composeSystem(profile: string, cap: number): string {
  const who = profile.trim() ? `The reader's profile:\n"""\n${profile.trim()}\n"""` : 'No reader profile is set; the reader is a software engineer interested in AI.';
  return `You compose a daily tech briefing.
${who}

highlights: choose the most important and relevant stories, at most ${cap} in total.
- Each highlight's section must match the story's category: model → models, tool → tools, headline → headlines, video → watch. Other categories cannot be highlights.
- Put at most 2 stories in watch.
- Within a section, order by importance (most important first).

concept: pick one or two themes from today's top stories and choose an established concept those stories depend on.
- Prefer a concept from the book pool when it genuinely fits; then use its key as conceptKey and set sourceRef to the book title.
- Otherwise use a well-established concept with a kebab-case conceptKey and set sourceRef to an official documentation URL.
- Never quote book text. Do not reuse a recently used concept key.
- bodyMd is markdown, at most 200 words. relatedStoryId is the story the concept relates to.
- quiz: exactly 3 questions, each with exactly 4 choices and the index (0–3) of the correct one.

quickstartTarget: pick a tool, SDK or API mentioned in today's stories that a reader could try in about 5 minutes. docsUrl is its official docs or README URL, or null if unknown.
Respond with JSON matching the schema.`;
}

export function composePrompt(input: {
  stories: { id: number; title: string; category: string | null; score: number | null; summary: string | null }[];
  recentConceptKeys: string[];
  books: Book[];
  forbiddenKeys?: string[];
}): string {
  const stories = input.stories.map((s) => `${s.id} | ${s.category} | ${s.score} | ${s.title} | ${s.summary}`).join('\n');
  const books = input.books.map((b) => `${b.title} (${b.author}):\n${b.concepts.map((c) => `  - ${c}`).join('\n')}`).join('\n');
  const recent = input.recentConceptKeys.length ? input.recentConceptKeys.join(', ') : '(none)';
  const forbidden = input.forbiddenKeys?.length
    ? `\n\nIMPORTANT: these concept keys were used recently and are forbidden: ${input.forbiddenKeys.join(', ')}. Choose a different concept.`
    : '';
  return `Today's stories (id | category | score | title | summary):\n${stories}\n\nConcept keys used in the last 30 days: ${recent}\n\nBook pool:\n${books}${forbidden}`;
}
