import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { digests, stories, storyItems } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runS6 } from '../src/pipeline/s6-summarize.js';
import { summarizeSystem } from '../src/prompts/summarize.js';
import { ctx, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

function setup() {
  const db = testDb();
  seedDigest(db, { stage: 5 });
  const src = seedSource(db, { title: 'Lab Blog' });
  const story = (s: { category: 'model' | 'tool'; score: number; community?: string | null }, items: Parameters<typeof seedItem>[2][]) => {
    const d = db.select().from(digests).get()!;
    const row = db.insert(stories).values({ digestId: d.id, title: 'Story', ...s }).returning().get();
    const its = items.map((over) => seedItem(db, src.id, over));
    for (const it of its) db.insert(storyItems).values({ storyId: row.id, itemId: it.id }).run();
    return { row, items: its };
  };
  const get = (id: number) => db.select().from(stories).where(eq(stories.id, id)).get()!;
  return { db, story, get };
}

test('stats guard: a hallucinated stat is dropped and a real one kept', async () => {
  const { db, story, get } = setup();
  const { row, items } = story({ category: 'model', score: 9, community: 'People like it' }, [
    { url: 'https://lab.dev/m', content: 'The model scores 92.4%  on   MMLU and has a 1M context.' },
  ]);
  const fake = new FakeLlm({
    summarize: () => ({
      summary: 'A lab released a model.',
      stats: [
        { label: 'MMLU', value: '92.4% on MMLU', sourceUrl: items[0]!.url },
        { label: 'GPQA', value: '88%', sourceUrl: items[0]!.url },
        { label: 'Context', value: '1M', sourceUrl: 'https://elsewhere.dev' },
      ],
      pros: ['Fast'],
      cons: ['Pricey'],
    }),
  });
  await runS6(ctx(db, fake));
  expect(get(row.id)).toMatchObject({
    summary: 'A lab released a model.',
    stats: [{ label: 'MMLU', value: '92.4% on MMLU', sourceUrl: items[0]!.url }],
    pros: ['Fast'],
    cons: ['Pricey'],
  });
  expect(db.select().from(digests).get()).toMatchObject({ stage: 6, inputTokens: 10, outputTokens: 5 });
});

test('a stat must come from the item it cites', async () => {
  const { db, story, get } = setup();
  const { row, items } = story({ category: 'model', score: 9 }, [
    { url: 'https://a.dev', content: 'Scores 70 points.' },
    { url: 'https://b.dev', content: 'Nothing numeric.' },
  ]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 's', stats: [{ label: 'x', value: '70', sourceUrl: items[1]!.url }] }) });
  await runS6(ctx(db, fake));
  expect(get(row.id).stats).toEqual([]);
});

test('pros and cons are dropped without community text', async () => {
  const { db, story, get } = setup();
  const { row } = story({ category: 'model', score: 9, community: null }, [{}]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 's', pros: ['Invented'], cons: ['Invented'] }) });
  await runS6(ctx(db, fake));
  expect(get(row.id)).toMatchObject({ pros: null, cons: null });
});

test('non-model stories have null stats, pros and cons', async () => {
  const { db, story, get } = setup();
  const { row, items } = story({ category: 'tool', score: 9, community: 'c' }, [{ content: 'Version 3 is 2x faster.' }]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 's', stats: [{ label: 'x', value: '2x', sourceUrl: items[0]!.url }], pros: ['p'], cons: ['c'] }) });
  await runS6(ctx(db, fake));
  expect(get(row.id)).toMatchObject({ summary: 's', stats: null, pros: null, cons: null });
});

test('stories below the threshold are not summarized', async () => {
  const { db, story, get } = setup();
  const { row: low } = story({ category: 'tool', score: 4 }, [{}]);
  const { row: high } = story({ category: 'tool', score: 5 }, [{}]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 'yes' }) });
  await runS6(ctx(db, fake));
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0]!.tier).toBe('fast');
  expect(get(low.id).summary).toBeNull();
  expect(get(high.id).summary).toBe('yes');
});

test('prompt includes source title, url, content (capped at 6000 total) and community', async () => {
  const { db, story } = setup();
  story({ category: 'model', score: 9, community: 'HN says hi' }, [
    { url: 'https://a.dev', content: 'a'.repeat(5000) },
    { url: 'https://b.dev', content: 'b'.repeat(5000) },
  ]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 's' }) });
  await runS6(ctx(db, fake));
  const p = fake.calls[0]!.prompt;
  expect(p).toContain('Lab Blog');
  expect(p).toContain('https://b.dev');
  expect(p).toContain('HN says hi');
  expect((p.match(/[ab]/g) ?? []).length).toBeLessThanOrEqual(6000 + 50);
  expect(p.match(/b/g)!.length).toBeLessThan(1100);
});

test('pros and cons are capped at 2 each', async () => {
  const { db, story, get } = setup();
  const { row } = story({ category: 'model', score: 9, community: 'Mixed reactions' }, [{ url: 'https://lab.dev/m', content: 'A model.' }]);
  const fake = new FakeLlm({ summarize: () => ({ summary: 's', pros: ['a', 'b', 'c'], cons: ['x', 'y', 'z'] }) });
  await runS6(ctx(db, fake));
  expect(get(row.id)).toMatchObject({ pros: ['a', 'b'], cons: ['x', 'y'] });
});

test('the summarize prompt asks for 1–2 sentences and at most 2 pros/cons', () => {
  expect(summarizeSystem(false)).toContain('1–2 plain sentences');
  expect(summarizeSystem(true)).toContain('at most 2 each');
});
