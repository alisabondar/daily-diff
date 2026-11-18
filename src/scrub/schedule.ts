import type { ScrubStore } from './store.js';

const etHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });

/**
 * True from 05:00 to 06:59 in America/New_York. The workflow is scheduled at 09:17 and 10:17 UTC; one of them is
 * 05:17 ET all year, and the other falls outside the window (winter) or is skipped because today is already
 * published (summer). The two-hour window lets a delayed summer run still go out.
 */
export function isScrubHour(now: Date): boolean {
  const hour = Number(etHour.format(now));
  return hour === 5 || hour === 6;
}

/** True when the scrub for `date` (YYYY-MM-DD) is already published, so a second scheduled run skips. */
export async function alreadyPublished(store: ScrubStore, date: string): Promise<boolean> {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return (await store.lastPublished(next.toISOString().slice(0, 10)))?.date === date;
}
