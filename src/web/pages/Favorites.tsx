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
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800'}`;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTag(null)} className={chip(tag === null)}>All</button>
        {data.tags.map((t) => (
          <button key={t.tag} onClick={() => setTag(t.tag)} className={chip(tag === t.tag)}>{t.tag} ({t.count})</button>
        ))}
      </div>
      {data.stories.length === 0 && <p className="text-neutral-500">No favorites yet.</p>}
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
