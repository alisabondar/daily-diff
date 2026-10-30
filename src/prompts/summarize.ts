import { z } from 'zod';
import type { StoryWithItems } from '../pipeline/context.js';

export const SummarySchema = z.object({
  summary: z.string(),
  stats: z.array(z.object({ label: z.string(), value: z.string(), sourceUrl: z.string() })).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});
export type SummaryOutput = z.infer<typeof SummarySchema>;

export const ITEM_CONTENT_CAP = 6000;

export function summarizeSystem(isModel: boolean): string {
  const modelRules = isModel
    ? `
This story is an AI model release. Also:
- stats: include only numbers that appear literally in the provided source text. Copy each value exactly as written and set sourceUrl to the url of the item it came from.
- pros and cons: at most 3 each, drawn ONLY from the community reaction text. If no community reaction is provided, omit pros and cons.`
    : `
Do not include stats, pros or cons.`;
  return `You write summaries for a daily tech briefing.
- summary: 2–3 plain sentences covering what happened and why it matters. Do not hype. Do not repeat the headline.${modelRules}
Respond with JSON matching the schema.`;
}

export function summarizePrompt(story: StoryWithItems): string {
  let budget = ITEM_CONTENT_CAP;
  const blocks = story.items.map((i) => {
    const content = i.content.slice(0, Math.max(0, budget));
    budget -= content.length;
    return `Source: ${i.source.title}\nurl: ${i.url}\n${content}`;
  });
  const community = story.community ? `\n\nCommunity reaction:\n${story.community}` : '';
  return `Story: ${story.title}\n\n${blocks.join('\n\n')}${community}`;
}
