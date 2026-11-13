import { expect, test } from 'vitest';
import { missedDays } from '../src/missed.js';

process.env.TZ = 'UTC';
const at = (d: string, h = 12) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`);
// Catch-up built Thu 11-12, window from Mon 11-09 08:00: missed Mon, Tue, Wed.
const digest = { date: '2026-11-12', windowStart: at('2026-11-09', 8) };

test('groups stories into the missed days, in date order', () => {
  const r = missedDays(digest, [
    { id: 3, publishedAt: at('2026-11-11') },
    { id: 1, publishedAt: at('2026-11-09', 9) },
    { id: 2, publishedAt: at('2026-11-10') },
    { id: 4, publishedAt: at('2026-11-11', 20) },
  ]);
  expect(r).toEqual([
    { date: '2026-11-09', storyIds: [1] },
    { date: '2026-11-10', storyIds: [2] },
    { date: '2026-11-11', storyIds: [3, 4] },
  ]);
});

test('a story published before the window goes to the first missed day', () => {
  expect(missedDays(digest, [{ id: 7, publishedAt: at('2026-11-07') }])).toEqual([{ date: '2026-11-09', storyIds: [7] }]);
});

test('a story published on the digest day is excluded', () => {
  expect(missedDays(digest, [{ id: 8, publishedAt: at('2026-11-12', 6) }])).toEqual([]);
});

test('days with no stories are omitted', () => {
  const r = missedDays(digest, [{ id: 1, publishedAt: at('2026-11-09') }, { id: 2, publishedAt: at('2026-11-11') }]);
  expect(r.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-11']);
});
