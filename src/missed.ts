import { localDate } from './time.js';

export interface MissedDay { date: string; storyIds: number[] }

/**
 * Catch-up stories grouped by the local day they were published, for the "You missed" links (step 28).
 * Days run from the window start to the day before the digest; earlier stories clamp to the first day.
 */
export function missedDays(digest: { date: string; windowStart: number }, stories: { id: number; publishedAt: number }[]): MissedDay[] {
  const first = localDate(new Date(digest.windowStart));
  const byDay = new Map<string, number[]>();
  for (const s of stories) {
    let day = localDate(new Date(s.publishedAt));
    if (day >= digest.date) continue;
    if (day < first) day = first;
    byDay.set(day, [...(byDay.get(day) ?? []), s.id]);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, storyIds]) => ({ date, storyIds }));
}
