import { useEffect, useState } from 'react';
import type { PublishedStory } from '../../shared/published.js';
import { StoryCard } from '../components/StoryCard';
import { useStore } from '../data/store';

export function Favorites() {
  const { reader, state } = useStore();
  const [tag, setTag] = useState<string | null>(null);
  const [stories, setStories] = useState<PublishedStory[] | null>(null);
  const keys = state.favorites.map((f) => f.key);
  const keyList = keys.join(',');

  useEffect(() => {
    if (!reader) return;
    reader.storiesByKeys(keys).then(setStories, () => setStories([]));
    // refetch only when the set of saved keys changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, keyList]);

  const counts = new Map<string, number>();
  for (const f of state.favorites) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts].sort(([a], [b]) => a.localeCompare(b));
  const byKey = new Map(state.favorites.map((f) => [f.key, f]));
  const shown = (stories ?? [])
    .filter((s) => byKey.has(s.key) && (!tag || byKey.get(s.key)!.tags.includes(tag)))
    .sort((a, b) => byKey.get(b.key)!.createdAt - byKey.get(a.key)!.createdAt);

  if (!stories) return null;
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-neutral-200/60 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}`;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Favorites</h1>
      {state.favorites.length > 0 && <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTag(null)} className={chip(tag === null)}>All</button>
        {tags.map(([t, n]) => (
          <button key={t} onClick={() => setTag(t)} className={chip(tag === t)}>{t} <span className="opacity-60">{n}</span></button>
        ))}
      </div>}
      {shown.length === 0 && <p className="py-10 text-center text-neutral-500">{!tag && <span aria-hidden className="mb-2 block text-3xl text-neutral-400">☆</span>}{tag ? `Nothing tagged “${tag}”.` : <>Nothing saved yet. Use <span className="whitespace-nowrap">☆ Save</span> on any story to keep it here.</>}</p>}
      {shown.map((s) => <StoryCard key={s.key} story={s} date={s.date} />)}
    </div>
  );
}
