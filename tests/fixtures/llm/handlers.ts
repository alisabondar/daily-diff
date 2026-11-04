// FakeLlm handlers shared by tests and scripts/seed-demo.ts. They read the ids out of each
// stage's prompt so the whole pipeline runs deterministically with no network and no key.
import type { FakeHandlers } from '../../../src/llm/fake.js';

const lines = (prompt: string) => prompt.split('\n').filter((l) => /^\d+ \| /.test(l)).map((l) => l.split(' | '));

const categoryFor = (title: string, types: string): string => {
  if (/model|llm|weights/i.test(title)) return 'model';
  if (types.includes('video')) return 'video';
  if (types.includes('podcast')) return 'podcast';
  if (/show hn|tool|sdk|db\b|release|v\d/i.test(title)) return 'tool';
  if (types.includes('blog')) return 'long-read';
  return 'headline';
};

const topicFor = (title: string): string => {
  if (/model|llm|agent/i.test(title)) return 'ai';
  if (/show hn|tool|sdk|db\b/i.test(title)) return 'dev-tools';
  if (/scal|ship/i.test(title)) return 'infra';
  return 'industry';
};

const SECTION: Record<string, string> = { model: 'models', tool: 'tools', headline: 'headlines', video: 'watch' };

export const handlers: FakeHandlers = {
  group: (prompt) => ({ stories: lines(prompt).map(([id, , title]) => ({ title: title!.slice(0, 80), itemIds: [Number(id)] })) }),
  score: (prompt) => ({
    scores: lines(prompt).map(([id, title, types]) => ({ storyId: Number(id), score: 8, category: categoryFor(title!, types!), topic: topicFor(title!) })),
  }),
  summarize: (prompt) => ({
    summary: `${prompt.split('\n')[0]!.replace(/^Story: /, '')} — a short, plain summary of what happened and why it matters.`,
  }),
  compose: (prompt) => {
    const stories = lines(prompt).map(([id, category]) => ({ id: Number(id), category: category! }));
    const highlights = stories.filter((s) => SECTION[s.category]).map((s) => ({ storyId: s.id, section: SECTION[s.category]! }));
    const first = stories[0]?.id ?? 0;
    const tool = stories.find((s) => s.category === 'tool')?.id ?? first;
    return {
      highlights,
      concept: {
        conceptKey: 'write-ahead-log',
        title: 'Write-ahead logs',
        bodyMd: 'A **write-ahead log** records every change *before* it is applied.\n\n- Durable\n- Replayable',
        quiz: [
          { q: 'When is a WAL entry written?', choices: ['Before the change', 'After', 'Never', 'Weekly'], answerIndex: 0 },
          { q: 'What does replaying the log do?', choices: ['Deletes data', 'Recovers state', 'Compresses', 'Nothing'], answerIndex: 1 },
          { q: 'Which system uses a WAL?', choices: ['A JPEG', 'A font', 'SQLite', 'A CSV'], answerIndex: 2 },
        ],
        relatedStoryId: first,
        sourceRef: 'Designing Data-Intensive Applications',
      },
      quickstartTarget: { storyId: tool, name: 'Tiny DB', docsUrl: null },
    };
  },
  quickstart: () => ({ title: 'Your first query with Tiny DB', bodyMd: '1. Install:\n\n```sh\nnpm i tinydb\n```\n\n2. Run `tinydb init`.', sourceRef: 'https://tinydb.dev' }),
  ping: () => ({ ok: true }),
};
