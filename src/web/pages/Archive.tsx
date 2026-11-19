import { useEffect, useState } from 'react';
import type { PublishedStory } from '../../shared/published.js';
import { StoryCard } from '../components/StoryCard';
import { useStore } from '../data/store';

const longDay = (d: string) => {
  const date = new Date(`${d}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
};

export function Archive() {
  const { reader } = useStore();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PublishedStory[] | null>(null);
  const [days, setDays] = useState<string[] | null>(null);

  useEffect(() => {
    reader?.dates().then(setDays, () => setDays([]));
  }, [reader]);

  useEffect(() => {
    if (!q.trim() || !reader) return setHits(null);
    let stale = false;
    const t = setTimeout(async () => {
      const body = await reader.search(q).catch(() => []);
      if (!stale) setHits(body);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, reader]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        aria-label="Search past stories"
        placeholder="Search past stories"
        className="w-full rounded border border-neutral-300 bg-neutral-50 px-3 py-2 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {hits ? (
        hits.length === 0 ? (
          <p className="py-10 text-center text-neutral-500">No past stories match “{q.trim()}”.</p>
        ) : (
          <div>
            <p className="text-xs text-neutral-500">{hits.length} {hits.length === 1 ? 'story' : 'stories'}</p>
            {hits.map((h) => <StoryCard key={h.key} story={h} date={h.date} />)}
          </div>
        )
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {days?.map((d, i) => (
              <li key={d}>
                <a href={`#/d/${d}`} className="group flex items-baseline justify-between gap-4 py-3">
                  <span className="group-hover:underline">{longDay(d)}</span>
                  {i === 0 && <span className="text-xs text-neutral-500">Latest</span>}
                </a>
              </li>
            ))}
          </ul>
          {days?.length === 0 && <p className="py-10 text-center text-neutral-500">No digests yet. The first appears after the morning scrub.</p>}
        </>
      )}
    </div>
  );
}
