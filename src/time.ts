const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the system timezone. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface Window { windowStart: number; windowEnd: number; kind: 'daily' | 'catchup' }

const HOUR = 3600_000;

export function computeWindow(lastDone: { windowEnd: number } | null, now: Date): Window {
  const windowEnd = now.getTime();
  const windowStart = Math.max(lastDone?.windowEnd ?? windowEnd - 24 * HOUR, windowEnd - 7 * 24 * HOUR);
  return { windowStart, windowEnd, kind: windowEnd - windowStart > 36 * HOUR ? 'catchup' : 'daily' };
}
