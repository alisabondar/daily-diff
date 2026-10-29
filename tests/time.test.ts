import { afterEach, expect, test } from 'vitest';
import { localDate } from '../src/time.js';

const origTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = origTz;
});

test('localDate uses the system timezone near midnight', () => {
  process.env.TZ = 'America/New_York';
  // 2026-03-02T04:30Z is 23:30 on Mar 1 in New York (EST, UTC-5)
  expect(localDate(new Date('2026-03-02T04:30:00Z'))).toBe('2026-03-01');
  expect(localDate(new Date('2026-03-02T05:30:00Z'))).toBe('2026-03-02');
});

test('localDate zero-pads month and day', () => {
  process.env.TZ = 'Asia/Tokyo';
  expect(localDate(new Date('2026-01-04T16:00:00Z'))).toBe('2026-01-05');
});
