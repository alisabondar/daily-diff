import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { Config } from '../src/config.js';
import { digestEntries, digests, learnItems, stories, storyItems, type Category } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import type { ComposeOutput } from '../src/prompts/compose.js';
import { DOCS_WARNING } from '../src/prompts/quickstart.js';
import { githubReadmeUrl, runS7 } from '../src/pipeline/s7-compose.js';
import { isSafePublicUrl } from '../src/sources/text.js';
import { ctx, fakeFetch, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

type Db = ReturnType<typeof testDb>;

function setup(digestOver: Parameters<typeof seedDigest>[1] = {}) {
  const db = testDb();
  const digest = seedDigest(db, { stage: 6, ...digestOver });
  const src = seedSource(db, { title: 'Src' });
  const story = (category: Category, score: number, opts: { summary?: string | null; urls?: string[]; content?: string } = {}) => {
    const row = db.insert(stories).values({ digestId: digest.id, title: `${category} ${score}`, category, score, summary: opts.summary === undefined ? 'sum' : opts.summary }).returning().get();
    for (const url of opts.urls ?? [`https://ex.dev/${Math.random()}`]) {
      db.insert(storyItems).values({ storyId: row.id, itemId: seedItem(db, src.id, { url, content: opts.content ?? 'announcement text' }).id }).run();
    }
    return row;
  };
  return { db, digest, story };
}

const concept = (relatedStoryId: number, conceptKey = 'consistent-hashing'): ComposeOutput['concept'] => ({
  conceptKey, title: 'Consistent hashing', bodyMd: 'Body', relatedStoryId, sourceRef: 'Designing Data-Intensive Applications',
  quiz: [0, 1, 2].map((n) => ({ q: `Q${n}`, choices: ['a', 'b', 'c', 'd'], answerIndex: n })),
});

function compose(out: Partial<ComposeOutput> & Pick<ComposeOutput, 'highlights'>, target: ComposeOutput['quickstartTarget'], relatedStoryId: number) {
  return { concept: concept(relatedStoryId), quickstartTarget: target, ...out };
}

const quickstart = (bodyMd = 'Run `npm i x`') => () => ({ title: 'Try X', bodyMd, sourceRef: 'https://x.dev/docs' });

const entries = (db: Db, tab: 'highlights' | 'more') =>
  db.select().from(digestEntries).where(eq(digestEntries.tab, tab)).all()
    .sort((a, b) => a.section.localeCompare(b.section) || a.position - b.position)
    .map((e) => ({ storyId: e.storyId, section: e.section }));

test.each([
  ['https://docs.example.com/start', true],
  ['http://docs.example.com/', false],
  ['https://localhost/x', false],
  ['https://printer.local/x', false],
  ['https://127.0.0.1/x', false],
  ['https://10.1.2.3/', false],
  ['https://172.16.0.1/', false],
  ['https://172.31.255.255/', false],
  ['https://172.32.0.1/', true],
  ['https://192.168.1.1/', false],
  ['https://169.254.169.254/latest', false],
  ['https://[::1]/', false],
  ['https://[fd12::1]/', false],
  ['https://[fc00::1]/', false],
  ['not a url', false],
])('isSafePublicUrl(%s) = %s', (u, ok) => {
  expect(isSafePublicUrl(u)).toBe(ok);
});

test('GitHub README URL is derived from a repo URL', () => {
  expect(githubReadmeUrl(['https://x.dev', 'https://github.com/acme/widget/tree/main/docs'])).toBe('https://raw.githubusercontent.com/acme/widget/HEAD/README.md');
  expect(githubReadmeUrl(['https://github.com/acme/widget.git'])).toBe('https://raw.githubusercontent.com/acme/widget/HEAD/README.md');
  expect(githubReadmeUrl(['https://github.com/acme'])).toBeNull();
});

test('an over-cap result is truncated, a third watch item dropped, a wrong-section pair dropped', async () => {
  const { db, story } = setup();
  const tools = Array.from({ length: 5 }, (_, i) => story('tool', 9 - i));
  const videos = [story('video', 8), story('video', 7), story('video', 6)];
  const pod = story('podcast', 9);
  const fake = new FakeLlm({
    compose: () => compose({
      highlights: [
        { storyId: pod.id, section: 'headlines' },
        ...videos.map((v) => ({ storyId: v.id, section: 'watch' as const })),
        ...tools.map((t) => ({ storyId: t.id, section: 'tools' as const })),
      ],
    }, { storyId: tools[0]!.id, name: 'X', docsUrl: null }, tools[0]!.id),
    quickstart: quickstart(),
  });
  await runS7(ctx(db, fake, { config: Config.parse({ highlightsCap: 4 }) }));
  expect(entries(db, 'highlights')).toEqual([
    { storyId: tools[0]!.id, section: 'tools' },
    { storyId: tools[1]!.id, section: 'tools' },
    { storyId: videos[0]!.id, section: 'watch' },
    { storyId: videos[1]!.id, section: 'watch' },
  ]);
});

test('catchup digests use a cap of 8', async () => {
  const { db, story } = setup({ kind: 'catchup' });
  const tools = Array.from({ length: 18 }, (_, i) => story('tool', 9));
  const fake = new FakeLlm({
    compose: () => compose({ highlights: tools.map((t) => ({ storyId: t.id, section: 'tools' as const })) }, { storyId: tools[0]!.id, name: 'X', docsUrl: null }, tools[0]!.id),
    quickstart: quickstart(),
  });
  await runS7(ctx(db, fake, { config: Config.parse({ highlightsCap: 4 }) }));
  expect(entries(db, 'highlights')).toHaveLength(8);
  expect(fake.calls[0]!.system).toContain('at most 8');
});

test('non-highlight summarized stories land in More sections by score', async () => {
  const { db, story } = setup();
  const hl = story('model', 9);
  const longLow = story('long-read', 5);
  const longHigh = story('long-read', 8);
  const pod = story('podcast', 6);
  const vid = story('video', 7);
  const head = story('headline', 6);
  story('tool', 9, { summary: null }); // not summarized → nowhere
  const fake = new FakeLlm({
    compose: () => compose({ highlights: [{ storyId: hl.id, section: 'models' }] }, { storyId: hl.id, name: 'X', docsUrl: null }, hl.id),
    quickstart: quickstart(),
  });
  await runS7(ctx(db, fake));
  expect(entries(db, 'more')).toEqual([
    { storyId: longHigh.id, section: 'long-reads' },
    { storyId: longLow.id, section: 'long-reads' },
    { storyId: head.id, section: 'other' },
    { storyId: pod.id, section: 'podcasts' },
    { storyId: vid.id, section: 'videos' },
  ]);
  expect(db.select().from(digests).get()).toMatchObject({ stage: 7, inputTokens: 20, outputTokens: 10 });
  expect(fake.calls.map((c) => [c.task, c.tier])).toEqual([['compose', 'strong'], ['quickstart', 'strong']]);
});

test('a repeated concept triggers exactly one retry with the forbidden keys', async () => {
  const { db, story } = setup({ date: '2026-10-29', windowEnd: Date.parse('2026-10-29T08:00:00Z') });
  const old = db.insert(digests).values({ date: '2026-10-20', kind: 'daily', status: 'done', windowStart: 0, windowEnd: 1, createdAt: Date.parse('2026-10-20T08:00:00Z') }).returning().get();
  db.insert(learnItems).values({ digestId: old.id, type: 'concept', conceptKey: 'consistent-hashing', title: 't', bodyMd: 'b', sourceRef: 'r' }).run();
  const t = story('tool', 9);
  let n = 0;
  const fake = new FakeLlm({
    compose: () => (n++, compose({ highlights: [], concept: concept(t.id, 'consistent-hashing') }, { storyId: t.id, name: 'X', docsUrl: null }, t.id)),
    quickstart: quickstart(),
  });
  await runS7(ctx(db, fake));
  const composeCalls = fake.calls.filter((c) => c.task === 'compose');
  expect(composeCalls).toHaveLength(2);
  expect(n).toBe(2);
  expect(composeCalls[0]!.prompt).toContain('consistent-hashing');
  expect(composeCalls[1]!.prompt).toMatch(/forbidden: consistent-hashing/);
  // accepted whatever it is after the one retry
  const learned = db.select().from(learnItems).where(eq(learnItems.type, 'concept')).all();
  expect(learned.at(-1)!.conceptKey).toBe('consistent-hashing');
});

test('concepts older than 30 days are not "recent"', async () => {
  const { db, story } = setup({ windowEnd: Date.parse('2026-10-29T08:00:00Z') });
  const old = db.insert(digests).values({ date: '2026-09-01', kind: 'daily', status: 'done', windowStart: 0, windowEnd: 1, createdAt: Date.parse('2026-09-01T08:00:00Z') }).returning().get();
  db.insert(learnItems).values({ digestId: old.id, type: 'concept', conceptKey: 'consistent-hashing', title: 't', bodyMd: 'b', sourceRef: 'r' }).run();
  const t = story('tool', 9);
  const fake = new FakeLlm({
    compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'X', docsUrl: null }, t.id),
    quickstart: quickstart(),
  });
  await runS7(ctx(db, fake));
  expect(fake.calls.filter((c) => c.task === 'compose')).toHaveLength(1);
});

test('GitHub repo in the target story: README is fetched and passed to Call B', async () => {
  const { db, story } = setup();
  const t = story('tool', 9, { urls: ['https://github.com/acme/widget'] });
  const fetchFn = fakeFetch({ 'https://raw.githubusercontent.com/acme/widget/HEAD/README.md': '# Widget\nnpm i widget' });
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'Widget', docsUrl: 'https://widget.dev' }, t.id), quickstart: quickstart() });
  await runS7(ctx(db, fake, { fetchFn }));
  expect(fetchFn.calls.map((c) => c.url)).toEqual(['https://raw.githubusercontent.com/acme/widget/HEAD/README.md']);
  const qs = fake.calls.find((c) => c.task === 'quickstart')!;
  expect(qs.prompt).toContain('npm i widget');
  expect(qs.prompt).toContain('Docs unavailable: no');
  const learned = db.select().from(learnItems).where(eq(learnItems.type, 'quickstart')).get()!;
  expect(learned).toMatchObject({ relatedStoryId: t.id, title: 'Try X', sourceRef: 'https://x.dev/docs' });
  expect(learned.bodyMd.startsWith(DOCS_WARNING)).toBe(false);
});

test('a safe docsUrl is fetched and stripped', async () => {
  const { db, story } = setup();
  const t = story('tool', 9);
  const fetchFn = fakeFetch({ 'https://widget.dev/docs': '<html><body><h1>Install</h1><p>pip install widget</p></body></html>' });
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'W', docsUrl: 'https://widget.dev/docs' }, t.id), quickstart: quickstart() });
  await runS7(ctx(db, fake, { fetchFn }));
  expect(fake.calls.find((c) => c.task === 'quickstart')!.prompt).toContain('Install pip install widget');
});

test('a failed docs fetch falls back to item content and sets the warning prefix', async () => {
  const { db, story } = setup();
  const t = story('tool', 9, { content: 'Widget 2 launched today' });
  const fetchFn = fakeFetch({ 'https://widget.dev/docs': 500 });
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'W', docsUrl: 'https://widget.dev/docs' }, t.id), quickstart: quickstart('Run it') });
  await runS7(ctx(db, fake, { fetchFn }));
  const qs = fake.calls.find((c) => c.task === 'quickstart')!;
  expect(qs.prompt).toContain('Widget 2 launched today');
  expect(qs.prompt).toMatch(/Docs unavailable: yes/);
  const learned = db.select().from(learnItems).where(eq(learnItems.type, 'quickstart')).get()!;
  expect(learned.bodyMd).toBe(`${DOCS_WARNING}\n\nRun it`);
});

test('an unsafe docsUrl is not fetched', async () => {
  const { db, story } = setup();
  const t = story('tool', 9);
  const fetchFn = fakeFetch({ 'http://127.0.0.1/admin': 'secret' });
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'W', docsUrl: 'http://127.0.0.1/admin' }, t.id), quickstart: quickstart() });
  await runS7(ctx(db, fake, { fetchFn }));
  expect(fetchFn.calls).toEqual([]);
  expect(fake.calls.find((c) => c.task === 'quickstart')!.prompt).toMatch(/Docs unavailable: yes/);
});

test('an invalid target storyId falls back to the best tool story with docsUrl null', async () => {
  const { db, story } = setup();
  story('model', 10);
  const toolLow = story('tool', 6);
  const toolHigh = story('tool', 8);
  const fetchFn = fakeFetch({});
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: 99999, name: 'Ghost', docsUrl: 'https://ghost.dev' }, toolLow.id), quickstart: quickstart() });
  await runS7(ctx(db, fake, { fetchFn }));
  expect(fetchFn.calls).toEqual([]);
  expect(db.select().from(learnItems).where(eq(learnItems.type, 'quickstart')).get()!.relatedStoryId).toBe(toolHigh.id);
  expect(toolLow.id).not.toBe(toolHigh.id);
});

test('with no tool story the fallback target is the highest-scoring story', async () => {
  const { db, story } = setup();
  const top = story('headline', 9);
  story('model', 7);
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: 99999, name: 'Ghost', docsUrl: null }, top.id), quickstart: quickstart() });
  await runS7(ctx(db, fake, { fetchFn: fakeFetch({}) }));
  expect(db.select().from(learnItems).where(eq(learnItems.type, 'quickstart')).get()!.relatedStoryId).toBe(top.id);
});

test('an unknown relatedStoryId is set to null', async () => {
  const { db, story } = setup();
  const t = story('tool', 9);
  const fake = new FakeLlm({ compose: () => compose({ highlights: [] }, { storyId: t.id, name: 'X', docsUrl: null }, 424242), quickstart: quickstart() });
  await runS7(ctx(db, fake));
  expect(db.select().from(learnItems).where(eq(learnItems.type, 'concept')).get()!.relatedStoryId).toBeNull();
});

test('zero summarized stories: no LLM calls, no entries, no learn items', async () => {
  const { db, story } = setup();
  story('tool', 2, { summary: null });
  const fake = new FakeLlm({});
  await runS7(ctx(db, fake));
  expect(fake.calls).toEqual([]);
  expect(db.select().from(digestEntries).all()).toEqual([]);
  expect(db.select().from(learnItems).all()).toEqual([]);
  expect(db.select().from(digests).get()!.stage).toBe(7);
});

test('re-running S7 replaces entries and learn items', async () => {
  const { db, story } = setup();
  const t = story('tool', 9);
  const fake = new FakeLlm({ compose: () => compose({ highlights: [{ storyId: t.id, section: 'tools' }] }, { storyId: t.id, name: 'X', docsUrl: null }, t.id), quickstart: quickstart() });
  await runS7(ctx(db, fake));
  await runS7(ctx(db, fake));
  expect(db.select().from(digestEntries).all()).toHaveLength(1);
  expect(db.select().from(learnItems).all()).toHaveLength(2);
});
