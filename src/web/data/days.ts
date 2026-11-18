import type { PublishedScrub } from '../../shared/published.js';

export interface DayReader { day(date: string): Promise<PublishedScrub | null> }

export const DAY_CACHE_PREFIX = 'daily-diff:scrub:';
export const DAY_CACHE_MAX = 14;

/** Published days never change: serve them from storage, fetch only on a miss, keep the newest DAY_CACHE_MAX dates. */
export function cachedDays(reader: DayReader, storage: Storage | null): DayReader {
  const read = (date: string): PublishedScrub | null => {
    try {
      const raw = storage?.getItem(DAY_CACHE_PREFIX + date);
      return raw ? (JSON.parse(raw) as PublishedScrub) : null;
    } catch {
      return null;
    }
  };
  const write = (scrub: PublishedScrub) => {
    try {
      if (!storage) return;
      storage.setItem(DAY_CACHE_PREFIX + scrub.date, JSON.stringify(scrub));
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(DAY_CACHE_PREFIX)) keys.push(k);
      }
      // keys end in YYYY-MM-DD, so a string sort is a date sort
      for (const k of keys.sort().slice(0, Math.max(0, keys.length - DAY_CACHE_MAX))) storage.removeItem(k);
    } catch {
      // storage full or blocked: the day still renders, it just isn't cached
    }
  };
  return {
    async day(date) {
      const hit = read(date);
      if (hit) return hit;
      const scrub = await reader.day(date);
      if (scrub) write(scrub);
      return scrub;
    },
  };
}
