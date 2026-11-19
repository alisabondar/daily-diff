import { useEffect, useState } from 'react';
import type { PublishedScrub } from '../../shared/published.js';
import { useStore } from './store';

/** Loads one day's scrub: `date`, or the latest published one when unset. */
export function useDay(date?: string) {
  const { reader } = useStore();
  const [latest, setLatest] = useState<string | null | undefined>(undefined);
  const [scrub, setScrub] = useState<PublishedScrub | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reader || date) return;
    reader.dates().then((d) => setLatest(d[0] ?? null), (e: Error) => setError(e.message));
  }, [reader, date]);
  const shown = date ?? latest ?? null;

  useEffect(() => {
    setScrub(null);
    setMissing(false);
    if (!reader || !shown) return;
    reader.day(shown).then((s) => (s ? setScrub(s) : setMissing(true)), (e: Error) => setError(e.message));
  }, [reader, shown]);

  return { latest, shown, scrub, missing, error };
}
