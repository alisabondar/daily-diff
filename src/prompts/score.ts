import { z } from 'zod';
import { Category, Topic } from '../db/schema.js';
import type { StoryWithItems } from '../pipeline/context.js';

export const ScoreSchema = z.object({ scores: z.array(z.object({ storyId: z.number().int(), score: z.number(), category: Category, topic: Topic.optional() })) });

export function scoreSystem(profile: string): string {
  const who = profile.trim()
    ? `The reader's profile:\n"""\n${profile.trim()}\n"""\nScore each story's relevance to this reader.`
    : 'No reader profile is set. Score each story by its general importance to a software engineer interested in AI.';
  return `You score and categorize tech news stories for a daily briefing.
${who}
Rules:
- score is an integer from 0 (irrelevant) to 10 (must read).
- category is one of: model, tool, headline, video, long-read, podcast.
- Use "model" only for new or updated AI model releases.
- Anything from a video source is "video" unless it is a model release.
- Anything from a podcast source is "podcast".
- topic is the subject area, one of: ai (AI models, research labs, AI products), dev-tools (languages, frameworks, libraries, developer products), security, infra (cloud, databases, networking, ops), industry (companies, funding, policy, regulation), research (papers and non-AI science), other.
- Return one entry for every story id you are given.
Respond with JSON matching the schema.`;
}

export function scorePrompt(batch: StoryWithItems[]): string {
  const lines = batch.map((s) => {
    const types = [...new Set(s.items.map((i) => i.source.type))].join(',');
    return `${s.id} | ${s.title} | ${types} | ${(s.items[0]?.excerpt ?? '').slice(0, 300)}`;
  });
  return `Stories (id | title | source types | excerpt):\n${lines.join('\n')}`;
}
