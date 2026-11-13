import { expect, test } from 'vitest';
import { computeStreak } from '../src/streak.js';

// 2026-11-09 is a Monday; 2026-11-15 a Sunday.
const days = (from: number, to: number, month = '11') => Array.from({ length: to - from + 1 }, (_, i) => `2026-${month}-${String(from + i).padStart(2, '0')}`);

test('consecutive days count, including today', () => {
  expect(computeStreak(days(9, 12), '2026-11-12')).toMatchObject({ current: 4, best: 4, readToday: true });
});

test('today unread keeps yesterday’s streak', () => {
  expect(computeStreak(days(9, 11), '2026-11-12')).toMatchObject({ current: 3, readToday: false, freezeAvailable: true });
});

test('one missed day in a week is forgiven and not counted', () => {
  const s = computeStreak(['2026-11-09', '2026-11-11', '2026-11-12'], '2026-11-12');
  expect(s.current).toBe(3);
  expect(s.freezeAvailable).toBe(false);
});

test('two misses in one week break the streak', () => {
  expect(computeStreak(['2026-11-09', '2026-11-11', '2026-11-13'], '2026-11-13').current).toBe(1);
});

test('misses in different weeks are each forgiven', () => {
  // miss Thu 11-05 (week of 11-02) and Tue 11-10 (week of 11-09)
  const read = [...days(2, 4), ...days(6, 9), ...days(11, 12)];
  expect(computeStreak(read, '2026-11-12').current).toBe(9);
});

test('best survives a break', () => {
  const read = [...days(2, 6), '2026-11-11', '2026-11-12'];
  expect(computeStreak(read, '2026-11-12')).toMatchObject({ current: 2, best: 5 });
});

test('no reads: nothing, freeze available', () => {
  expect(computeStreak([], '2026-11-12')).toEqual({ current: 0, best: 0, readToday: false, freezeAvailable: true });
});
