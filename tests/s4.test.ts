import { expect, test } from 'vitest';
import { Config } from '../src/config.js';
import { digests, stories, storyItems } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runS4 } from '../src/pipeline/s4-score.js';
import { scoreSystem } from '../src/prompts/score.js';
import { ctx, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

function setup() {
  const db = testDb();
  const d = seedDigest(db, { stage: 3 });
  const story = (title: string, type: 'news' | 'blog' | 'podcast' | 'video' | 'community') => {
    const src = seedSource(db, { type });
    const item = seedItem(db, src.id, { excerpt: `${title} excerpt` });
    const s = db.insert(stories).values({ digestId: d.id, title }).returning().get();
    db.insert(storyItems).values({ storyId: s.id, itemId: item.id }).run();
    return s;
  };
  return { db, story };
}

const byId = (db: ReturnType<typeof testDb>) => new Map(db.select().from(stories).all().map((s) => [s.id, s]));

test('missing stories get score 0 and a category from the source type', async () => {
  const { db, story } = setup();
  const a = story('A', 'news');
  const pod = story('Pod', 'podcast');
  const blog = story('Blog', 'blog');
  const fake = new FakeLlm({ score: () => ({ scores: [{ storyId: a.id, score: 7, category: 'tool' }] }) });
  await runS4(ctx(db, fake));
  const rows = byId(db);
  expect(rows.get(a.id)).toMatchObject({ score: 7, category: 'tool' });
  expect(rows.get(pod.id)).toMatchObject({ score: 0, category: 'podcast' });
  expect(rows.get(blog.id)).toMatchObject({ score: 0, category: 'long-read' });
  expect(db.select().from(digests).get()).toMatchObject({ stage: 4, inputTokens: 10, outputTokens: 5 });
});

test('scores are clamped to 0–10 integers and unknown ids ignored', async () => {
  const { db, story } = setup();
  const hi = story('Hi', 'news');
  const lo = story('Lo', 'news');
  const fake = new FakeLlm({
    score: () => ({ scores: [
      { storyId: hi.id, score: 14, category: 'headline' },
      { storyId: lo.id, score: -3.2, category: 'headline' },
      { storyId: 9999, score: 5, category: 'model' },
    ] }),
  });
  await runS4(ctx(db, fake));
  expect(byId(db).get(hi.id)!.score).toBe(10);
  expect(byId(db).get(lo.id)!.score).toBe(0);
});

test('the profile appears in the system prompt; prompt lists id, title, types and excerpt', async () => {
  const { db, story } = setup();
  const a = story('Agents SDK', 'blog');
  const fake = new FakeLlm({ score: () => ({ scores: [] }) });
  await runS4(ctx(db, fake, { config: Config.parse({ profile: 'I build Rust databases' }) }));
  expect(fake.calls[0]!.system).toContain('I build Rust databases');
  expect(fake.calls[0]!.tier).toBe('fast');
  expect(fake.calls[0]!.prompt).toContain(`${a.id} | Agents SDK | blog | Agents SDK excerpt`);
});

test('an empty profile asks for general importance to an AI-curious engineer', async () => {
  const { db, story } = setup();
  story('A', 'news');
  const fake = new FakeLlm({ score: () => ({ scores: [] }) });
  await runS4(ctx(db, fake));
  expect(fake.calls[0]!.system).toMatch(/software engineer interested in AI/);
});

test('stories are scored in batches of 50', async () => {
  const { db, story } = setup();
  for (let i = 0; i < 120; i++) story(`S${i}`, 'news');
  const fake = new FakeLlm({ score: () => ({ scores: [] }) });
  await runS4(ctx(db, fake));
  expect(fake.calls).toHaveLength(3);
});

test('topics are stored; an omitted topic or a missing story becomes other', async () => {
  const { db, story } = setup();
  const a = story('A', 'news');
  const b = story('B', 'news');
  const missing = story('C', 'blog');
  const fake = new FakeLlm({ score: () => ({ scores: [{ storyId: a.id, score: 7, category: 'tool', topic: 'security' }, { storyId: b.id, score: 5, category: 'headline' }] }) });
  await runS4(ctx(db, fake));
  const rows = byId(db);
  expect(rows.get(a.id)!.topic).toBe('security');
  expect(rows.get(b.id)!.topic).toBe('other');
  expect(rows.get(missing.id)!.topic).toBe('other');
});

test('the score prompt lists every topic', () => {
  for (const t of ['ai', 'dev-tools', 'security', 'infra', 'industry', 'research', 'other']) expect(scoreSystem('')).toContain(t);
});
