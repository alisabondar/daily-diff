import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api } from '../api';
import { StoryCard } from '../components/StoryCard';

type Day = InferResponseType<typeof api.digests.$get>[number];
type Hit = InferResponseType<typeof api.search.$get, 200>[number];

const PAGE = 60;

export function Archive() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const loadDays = async (before?: string) => {
    const res = await api.digests.$get({ query: { limit: String(PAGE), ...(before ? { before } : {}) } });
    const page = await res.json();
    setDays((d) => (before ? [...d, ...page] : page));
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
        placeholder="Search past stories"
        className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
      />
      {hits ? (
        hits.length === 0 ? (
          <p className="text-neutral-500">No matches.</p>
        ) : (
          hits.map((h) => (
            <div key={h.story.id}>
              <a href={`#/d/${h.digestDate}`} className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{h.digestDate}</a>
              <StoryCard story={h.story} />
            </div>
          ))
        )
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {days.map((d) => (
              <li key={d.date}>
                <a href={`#/d/${d.date}`} className="flex justify-between py-3 hover:underline">
                  <span>{d.date}</span>
                  <span className="text-sm text-neutral-500">
                    {d.kind === 'catchup' ? 'catch-up' : 'daily'}{d.isRaw ? ' · raw' : ''} · {d.highlightCount} highlights
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {days.length === 0 && <p className="text-neutral-500">No digests yet.</p>}
          {hasMore && <button onClick={() => loadDays(days[days.length - 1]!.date)} className="text-sm underline">Older</button>}
        </>
      )}
    </div>
  );
}
