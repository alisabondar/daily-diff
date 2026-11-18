import { expect, test } from 'vitest';
import { alreadyPublished, isScrubHour } from '../src/scrub/schedule.js';
import type { ScrubStore } from '../src/scrub/store.js';

const at = (iso: string) => isScrubHour(new Date(iso));

test('winter (EST): 09:17 UTC is 04:17 and skips; 10:17 UTC is 05:17 and runs', () => {
  expect(at('2026-01-15T09:17:00Z')).toBe(false);
  expect(at('2026-01-15T10:17:00Z')).toBe(true);
});

test('summer (EDT): 09:17 UTC is 05:17 and runs; 10:17 UTC is 06:17 and is still in the window (the published-today check skips it)', () => {
  expect(at('2026-07-15T09:17:00Z')).toBe(true);
  expect(at('2026-07-15T10:17:00Z')).toBe(true);
});

test('the window is 05:00–06:59 ET', () => {
  expect(at('2026-01-15T09:59:00Z')).toBe(false); // 04:59 EST
  expect(at('2026-01-15T10:00:00Z')).toBe(true); // 05:00 EST
  expect(at('2026-01-15T11:59:00Z')).toBe(true); // 06:59 EST
  expect(at('2026-01-15T12:00:00Z')).toBe(false); // 07:00 EST
});

test('daylight-saving transition days (2026-03-08 spring forward, 2026-11-01 fall back)', () => {
  expect(at('2026-03-08T09:17:00Z')).toBe(true); // 05:17 EDT
  expect(at('2026-03-08T08:17:00Z')).toBe(false); // 04:17 EDT
  expect(at('2026-11-01T10:17:00Z')).toBe(true); // 05:17 EST
  expect(at('2026-11-01T09:17:00Z')).toBe(false); // 04:17 EST
});

test('a summer run delayed past 06:00 still runs', () => {
  expect(at('2026-07-15T10:05:00Z')).toBe(true); // 06:05 EDT
});

const storeWith = (dates: string[]): ScrubStore => ({
  async lastPublished(before) { const d = dates.filter((x) => x < before).sort().at(-1); return d ? { date: d, windowEnd: 0 } : null; },
  async upsertScrub() {}, async upsertCatalog() {},
});

test('alreadyPublished is true only when that exact date is published', async () => {
  expect(await alreadyPublished(storeWith(['2026-11-17', '2026-11-18']), '2026-11-18')).toBe(true);
  expect(await alreadyPublished(storeWith(['2026-11-17']), '2026-11-18')).toBe(false);
  expect(await alreadyPublished(storeWith([]), '2026-11-18')).toBe(false);
  expect(await alreadyPublished(storeWith(['2026-12-31']), '2026-12-31')).toBe(true); // year rollover
});
