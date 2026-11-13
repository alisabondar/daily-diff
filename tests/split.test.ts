import { expect, test } from 'vitest';
import { planSplit } from '../src/pipeline/split.js';

process.env.TZ = 'UTC';
const at = (d: string, h = 12) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`);
// Catch-up built Thu 11-12, window from Mon 11-09 08:00: missed Mon, Tue, Wed.
const digest = { date: '2026-11-12', windowStart: at('2026-11-09', 8) };
const none = { highlighted: new Set<number>(), taken: new Set<string>() };
const s = (id: number, day: string, score = 5) => ({ id, score, publishedAt: at(day) });

test('stories go to the day they were published, in date order', () => {
  expect(planSplit(digest, [s(3, '2026-11-11'), s(1, '2026-11-09'), s(2, '2026-11-10')], none)).toEqual([
    { date: '2026-11-09', storyIds: [1] },
    { date: '2026-11-10', storyIds: [2] },
    { date: '2026-11-11', storyIds: [3] },
  ]);
});

test('a story published before the window clamps to the first day', () => {
  expect(planSplit(digest, [s(7, '2026-11-06')], none)).toEqual([{ date: '2026-11-09', storyIds: [7] }]);
});

test('the digest’s own day and taken days stay in the catch-up', () => {
  const r = planSplit(digest, [s(1, '2026-11-12'), s(2, '2026-11-09'), s(3, '2026-11-10')], { ...none, taken: new Set(['2026-11-09']) });
  expect(r).toEqual([{ date: '2026-11-10', storyIds: [3] }]);
});

test('highlighted stories never move', () => {
  expect(planSplit(digest, [s(1, '2026-11-10'), s(2, '2026-11-10')], { ...none, highlighted: new Set([1]) })).toEqual([{ date: '2026-11-10', storyIds: [2] }]);
});

test('each day takes its top perDay by score, ties by lower id', () => {
  const stories = [s(1, '2026-11-10', 3), s(2, '2026-11-10', 9), s(3, '2026-11-10', 6), s(4, '2026-11-10', 6), { id: 5, score: null, publishedAt: at('2026-11-10') }];
  expect(planSplit(digest, stories, { ...none, perDay: 3 })).toEqual([{ date: '2026-11-10', storyIds: [2, 3, 4] }]);
});

test('defaults to 5 per day', () => {
  const stories = Array.from({ length: 7 }, (_, i) => s(i + 1, '2026-11-10', 10 - i));
  expect(planSplit(digest, stories, none)[0]!.storyIds).toEqual([1, 2, 3, 4, 5]);
});
