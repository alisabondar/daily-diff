import { expect, test } from 'vitest';
import { TOPICS } from '../src/shared/enums.js';
import { loadPacks } from '../src/packs/index.js';
import { defaultPacksFor, type PackDefaults } from '../src/web/data/pack-defaults.js';

const packs: PackDefaults[] = [
  { id: 'ai', defaultEnabled: true, topics: ['ai'] },
  { id: 'sec', defaultEnabled: true, topics: ['security'] },
  { id: 'research', defaultEnabled: false, topics: ['research'] },
  { id: 'podcasts', defaultEnabled: true, topics: [] },
  { id: 'youtube', defaultEnabled: false, topics: [] },
];

test('with no topics picked, onboarding pre-ticks the default-on packs', () => {
  expect(defaultPacksFor(packs, [])).toEqual(['ai', 'sec', 'podcasts']);
});

test('with topics picked: packs on those topics (even default-off ones), plus default-on packs with no topic', () => {
  expect(defaultPacksFor(packs, ['ai', 'research'])).toEqual(['ai', 'research', 'podcasts']);
});

test('every shipped pack lists valid topics; the research and infra packs start off', () => {
  const loaded = loadPacks();
  for (const p of loaded) for (const t of p.topics) expect(TOPICS).toContain(t);
  for (const id of ['research', 'infra']) {
    const p = loaded.find((x) => x.id === id);
    expect(p, id).toBeDefined();
    expect(p!.defaultEnabled).toBe(false);
    expect(p!.topics).toEqual([id]);
  }
});
