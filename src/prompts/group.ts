import { z } from 'zod';
import type { Item } from '../pipeline/s2-store.js';

export const GroupSchema = z.object({ stories: z.array(z.object({ title: z.string(), itemIds: z.array(z.number().int()) })) });
export type GroupOutput = z.infer<typeof GroupSchema>;

export const GROUP_SYSTEM = `You group news items into stories.
Rules:
- Put items in the same story only when they report the same event or release (for example, the same product launch covered by several outlets).
- Do not group items that are merely about the same topic.
- Each story's title is a neutral headline of 12 words or fewer. No hype.
- Every item id you are given must appear in exactly one story. A story may contain a single item.
Respond with JSON matching the schema.`;

export function groupPrompt(lines: { item: Item; sourceTitle: string }[]): string {
  const body = lines.map(({ item, sourceTitle }) => `${item.id} | ${sourceTitle} | ${item.title} | ${item.excerpt.slice(0, 200)}`).join('\n');
  return `Items (id | source | title | excerpt):\n${body}`;
}
