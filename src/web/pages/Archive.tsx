import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api } from '../api';
import { StoryCard } from '../components/StoryCard';
import { WeekHeatmap } from '../components/WeekHeatmap';

type Day = InferResponseType<typeof api.digests.$get>[number];
type Hit = InferResponseType<typeof api.search.$get, 200>[number];

const PAGE = 60;
const longDay = (d: string) => {
  const date = new Date(`${d}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
};

export function Archive() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadDays = async (before?: string) => {
    const res = await api.digests.$get({ query: { limit: String(PAGE), ...(before ? { before } : {}) } });
    const page = await res.json();
    setDays((d) => (before && d ? [...d, ...page] : page));
    setHasMore(page.length === PAGE);
  };
  useEffect(() => {
    loadDays();
  }, []);

  useEffect(() => {
    if (!q.trim()) return setHits(null);
    let stale = false;
    const t = setTimeout(async () => {
      const res = await api.search.$get({ query: { q } });
      const body = res.ok ? await res.json() : [];
      if (!stale) setHits(body);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-6">
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
            {hits.map((h) => <StoryCard key={h.story.id} story={h.story} date={h.digestDate} />)}
          </div>
        )
      ) : (
        <>
          <WeekHeatmap />
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {days?.map((d) => (
              <li key={d.date}>
                <a href={`#/d/${d.date}`} className="group flex items-baseline justify-between gap-4 py-3">
                  <span className="group-hover:underline">{longDay(d.date)}</span>
                  <span className="whitespace-nowrap text-sm text-neutral-500">
                    {d.kind === 'catchup' ? 'Catch-up' : 'Daily'}{d.isRaw ? ' · raw feed' : ''} · {d.highlightCount} {d.highlightCount === 1 ? 'highlight' : 'highlights'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {days?.length === 0 && <p className="py-10 text-center text-neutral-500">No digests yet. Today’s will appear here once it’s built.</p>}
          {hasMore && days && <button onClick={() => loadDays(days[days.length - 1]!.date)} className="text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100">Older digests</button>}
        </>
      )}
    </div>
  );
}
