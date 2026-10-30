import { z } from 'zod';

export const QuickstartSchema = z.object({ title: z.string(), bodyMd: z.string(), sourceRef: z.string() });
export const DOCS_WARNING = '⚠️ Steps inferred from announcement — check the official docs.';

export const QUICKSTART_SYSTEM = `You write a hands-on quick start for a developer tool.
- Every step must come from the provided docs text; do not invent commands or APIs.
- Include the install command and a first-use command or snippet.
- Keep it to about 5 minutes of work and at most 250 words, in markdown.
- If the docs are marked unavailable, start bodyMd with exactly: "${DOCS_WARNING}"
- sourceRef is the URL the steps came from.
Respond with JSON matching the schema.`;

export function quickstartPrompt(input: { name: string; storyTitle: string; docsUrl: string | null; docsText: string; docsUnavailable: boolean }): string {
  return `Tool: ${input.name}
Story: ${input.storyTitle}
Docs URL: ${input.docsUrl ?? '(none)'}
Docs unavailable: ${input.docsUnavailable ? 'yes — the text below is the announcement, not the docs' : 'no'}

Docs text:
${input.docsText}`;
}
