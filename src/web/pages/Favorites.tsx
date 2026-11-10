import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api } from '../api';
import { StoryCard } from '../components/StoryCard';

type Data = InferResponseType<typeof api.favorites.$get>;

export function Favorites() {
  const [tag, setTag] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

  const load = async () => {
    const res = await api.favorites.$get({ query: tag ? { tag } : {} });
    setData(await res.json());
  };
  useEffect(() => {
    load();
  }, [tag]);

  if (!data) return null;
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-neutral-200/60 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}`;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTag(null)} className={chip(tag === null)}>All</button>
        {data.tags.length > 0 && <>
        {data.tags.map((t) => (
          <button key={t.tag} onClick={() => setTag(t.tag)} className={chip(tag === t.tag)}>{t.tag} <span className="opacity-60">{t.count}</span></button>
        ))}</>}
      </div>
      {data.stories.length === 0 && <p className="py-10 text-center text-neutral-500">{tag ? `Nothing tagged “${tag}”.` : <>Nothing saved yet. Use <span className="whitespace-nowrap">☆ Save</span> on any story to keep it here.</>}</p>}
      {data.stories.map((s) => (
        <StoryCard
          key={s.id}
          story={s}
          onFavoriteChange={(f) => {
            if (f === null) setData({ ...data, stories: data.stories.filter((x) => x.id !== s.id) });
            load();
          }}
        />
      ))}
    </div>
  );
}
