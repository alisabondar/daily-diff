import { localDate } from '../time.js';

export interface SplitDay { date: string; storyIds: number[] }

/**
 * Picks each missed day's top stories out of a catch-up (step 29). Highlighted stories, stories from the
 * digest's own day, and days that already have a digest stay in the catch-up.
 */
export function planSplit(
  digest: { date: string; windowStart: number },
  stories: { id: number; score: number | null; publishedAt: number }[],
  { highlighted, taken, perDay = 5 }: { highlighted: Set<number>; taken: Set<string>; perDay?: number },
): SplitDay[] {
  const first = localDate(new Date(digest.windowStart));
  const byDay = new Map<string, typeof stories>();
  for (const s of stories) {
    if (highlighted.has(s.id)) continue;
    const published = localDate(new Date(s.publishedAt));
    const day = published < first ? first : published;
    if (day >= digest.date || taken.has(day)) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      storyIds: list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.id - b.id).slice(0, perDay).map((s) => s.id),
    }));
}
