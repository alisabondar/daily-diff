export interface Streak { current: number; best: number; readToday: boolean; freezeAvailable: boolean }

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Monday of the ISO week containing `ms`, as a key. */
const weekOf = (ms: number) => toDate(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY);

/**
 * Days read in a row, forgiving one missed day per ISO week (step 25).
 * A forgiven miss keeps the streak but doesn't add to it; today unread is not a miss.
 */
export function computeStreak(readDates: string[], today: string): Streak {
  const read = new Set(readDates);
  const end = toMs(today);
  const frozenWeeks = new Set<string>();
  let current = 0;
  let best = 0;
  const first = readDates.length ? Math.min(...readDates.map(toMs)) : end;
  for (let ms = first; ms <= end; ms += DAY) {
    if (read.has(toDate(ms))) current++;
    else if (ms === end || current === 0) continue;
    else if (frozenWeeks.has(weekOf(ms))) current = 0;
    else frozenWeeks.add(weekOf(ms));
    best = Math.max(best, current);
  }
  return { current, best, readToday: read.has(today), freezeAvailable: !frozenWeeks.has(weekOf(end)) };
}
