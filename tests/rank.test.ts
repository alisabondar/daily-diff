import { expect, test } from 'vitest';
import type { PublishedStory } from '../src/shared/published.js';
import { rankOf, rankView, type ViewSettings } from '../src/web/data/rank.js';

let n = 0;
const story = (over: Partial<PublishedStory> = {}): PublishedStory => {
  n++;
  return {
    key: `k${String(n).padStart(3, '0')}`, date: '2026-11-18', title: `Story ${n}`, links: [], sourceKeys: ['s1'], pack: 'ai-news', category: 'tool',
    topic: 'other', score: 6, summary: null, stats: null, pros: null, cons: null, readMinutes: 1, publishedAt: 0, ...over,
  };
};
const settings = (over: Partial<ViewSettings> = {}): ViewSettings => ({
  packs: ['ai-news', 'engineering'], disabledSources: [], topics: [], keywords: [], highlightsCap: 6, relevanceThreshold: 5, feedback: [], ...over,
});
const keysOf = (v: ReturnType<typeof rankView>) => [...v.highlights.flatMap((s) => s.stories), ...v.more.flatMap((s) => s.stories)].map((s) => s.key);

test('stories from packs the viewer has off are filtered out', () => {
  const on = story({ pack: 'ai-news' });
  const off = story({ pack: 'security' });
  expect(keysOf(rankView([on, off], settings()))).toEqual([on.key]);
});

test('a story is hidden only when every one of its sources is disabled', () => {
  const single = story({ sourceKeys: ['bad'] });
  const mixed = story({ sourceKeys: ['bad', 'good'] });
  expect(keysOf(rankView([single, mixed], settings({ disabledSources: ['bad'] })))).toEqual([mixed.key]);
});

test('rankOf: topic boost +2, keyword +1 (case-insensitive, title or summary), less-like-this −3', () => {
  const s = story({ score: 4, topic: 'security', title: 'A Rust release', summary: 'about memory safety', sourceKeys: ['src-a'] });
  expect(rankOf(s, settings())).toBe(4);
  expect(rankOf(s, settings({ topics: ['security'] }))).toBe(6);
  expect(rankOf(s, settings({ keywords: ['rust'] }))).toBe(5);
  expect(rankOf(s, settings({ keywords: ['MEMORY'] }))).toBe(5);
  expect(rankOf(s, settings({ keywords: ['rust', 'memory'] }))).toBe(5); // one keyword bonus, not per keyword
  const fb = (topic: PublishedStory['topic'], sourceKey: string | null) => ({ key: 'x', kind: 'less_like_this' as const, createdAt: 0, topic, sourceKey });
  expect(rankOf(s, settings({ feedback: [fb('security', null)] }))).toBe(1);
  expect(rankOf(s, settings({ feedback: [fb('ai', 'src-a')] }))).toBe(1);
  expect(rankOf(s, settings({ feedback: [fb('ai', 'other-src')] }))).toBe(4);
});

test('boosts and penalties move stories across the threshold', () => {
  const lifted = story({ score: 4, topic: 'security', category: 'long-read' });
  const sunk = story({ score: 6, topic: 'industry', category: 'long-read' });
  const fb = { key: 'x', kind: 'less_like_this' as const, createdAt: 0, topic: 'industry' as const, sourceKey: null };
  expect(keysOf(rankView([lifted, sunk], settings({ topics: ['security'], feedback: [fb] })))).toEqual([lifted.key]);
});

test('highlights take the top highlightsCap above the threshold, grouped in section order, each section by rank', () => {
  const m = story({ category: 'model', score: 9 });
  const t1 = story({ category: 'tool', score: 8 });
  const t2 = story({ category: 'tool', score: 10 });
  const h = story({ category: 'headline', score: 7 });
  const v = story({ category: 'video', score: 6 });
  const low = story({ category: 'tool', score: 3 });
  const view = rankView([h, t1, low, v, m, t2], settings({ highlightsCap: 4 }));
  expect(view.highlights.map((s) => [s.section, s.stories.map((x) => x.key)])).toEqual([
    ['models', [m.key]], ['tools', [t2.key, t1.key]], ['headlines', [h.key]],
  ]);
  // the video didn't make the cap and goes to More; the low tool is below the threshold and is gone
  expect(view.more.map((s) => [s.section, s.stories.map((x) => x.key)])).toEqual([['videos', [v.key]]]);
});

test('More holds non-highlight categories at or above the threshold in §B.4 order', () => {
  const pod = story({ category: 'podcast', score: 5 });
  const lr = story({ category: 'long-read', score: 7 });
  const lr2 = story({ category: 'long-read', score: 9 });
  const below = story({ category: 'long-read', score: 4 });
  const view = rankView([pod, lr, below, lr2], settings());
  expect(view.highlights).toEqual([]);
  expect(view.more.map((s) => [s.section, s.stories.map((x) => x.key)])).toEqual([['long-reads', [lr2.key, lr.key]], ['podcasts', [pod.key]]]);
});

test('ties break by higher score, then by key', () => {
  const a = story({ key: 'b', score: 6, topic: 'ai' }); // rank 8 with topic boost
  const b = story({ key: 'a', score: 8, topic: 'other' }); // rank 8
  const c = story({ key: 'c', score: 8, topic: 'other' }); // rank 8
  const view = rankView([a, c, b], settings({ topics: ['ai'] }));
  expect(view.highlights[0]!.stories.map((s) => s.key)).toEqual(['a', 'c', 'b']);
  expect(view.highlights[0]!.stories[2]!.rank).toBe(8);
});

test('empty settings (no topics or keywords) still produce a view; no packs gives nothing', () => {
  const s = story({ score: 7 });
  expect(keysOf(rankView([s], settings()))).toEqual([s.key]);
  expect(rankView([s], settings({ packs: [] }))).toEqual({ highlights: [], more: [] });
});
