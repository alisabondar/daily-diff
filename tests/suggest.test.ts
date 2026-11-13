import { afterEach, expect, test, vi } from 'vitest';
import { FakeLlm } from '../src/llm/fake.js';
import { suggestSources } from '../src/sources/suggest.js';

const s = (title: string, siteUrl: string) => ({ title, siteUrl, why: `Covers ${title}` });
const llm = (suggestions: ReturnType<typeof s>[]) => new FakeLlm({ suggest: () => ({ suggestions }) });
const existing = [{ title: 'Ars Technica', url: 'https://arstechnica.com', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index' }];
const run = (fake: FakeLlm, profile = 'Fintech infrastructure engineer') => suggestSources({ profile, existing }, fake);

afterEach(() => vi.unstubAllGlobals());

test('returns at most 6 suggestions', async () => {
  const many = Array.from({ length: 8 }, (_, i) => s(`Pub ${i}`, `https://pub${i}.com`));
  const r = await run(llm(many));
  expect(r).toHaveLength(6);
  expect(r[0]).toEqual(s('Pub 0', 'https://pub0.com'));
});

test('drops unsafe URLs', async () => {
  const r = await run(llm([s('A', 'http://plain.com'), s('B', 'https://localhost/x'), s('C', 'https://192.168.1.4/'), s('D', 'not a url'), s('E', 'https://ok.com')]));
  expect(r.map((x) => x.title)).toEqual(['E']);
});

test('drops hosts already among the sources, with or without www.', async () => {
  const r = await run(llm([s('Ars', 'https://www.arstechnica.com/'), s('Ars feeds', 'https://feeds.arstechnica.com/x'), s('New', 'https://finextra.com')]));
  expect(r.map((x) => x.title)).toEqual(['New']);
});

test('collapses duplicate hosts to the first', async () => {
  const r = await run(llm([s('One', 'https://fin.com/a'), s('Two', 'https://www.fin.com/b')]));
  expect(r.map((x) => x.title)).toEqual(['One']);
});

test('puts the profile and existing source titles in the prompt, on the strong tier', async () => {
  const fake = llm([]);
  await run(fake);
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0]).toMatchObject({ task: 'suggest', tier: 'strong' });
  expect(fake.calls[0]!.system).toContain('Fintech infrastructure engineer');
  expect(fake.calls[0]!.prompt).toContain('Ars Technica');
});

test('makes no network call', async () => {
  const fetchSpy = vi.fn(() => { throw new Error('no fetch allowed'); });
  vi.stubGlobal('fetch', fetchSpy);
  await run(llm([s('E', 'https://ok.com')]));
  expect(fetchSpy).not.toHaveBeenCalled();
});
