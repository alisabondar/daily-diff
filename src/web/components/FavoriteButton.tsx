import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';

export function FavoriteButton({ storyKey }: { storyKey: string }) {
  const store = useStore();
  const favorite = store.favorite(storyKey) ?? null;
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(favorite?.tags ?? []);
  const [input, setInput] = useState('');
  const [above, setAbove] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openPopover = () => {
    setTags(favorite?.tags ?? []);
    // Open upward when there's no room below for the popover (~220px).
    setAbove((ref.current?.getBoundingClientRect().bottom ?? 0) + 240 > window.innerHeight);
    setOpen(true);
  };
  const known = [...new Set(store.state.favorites.flatMap((f) => f.tags))].sort();
  const addTag = (t: string) => {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setInput('');
  };
  const save = () => {
    const all = input.trim() ? [...new Set([...tags, input.trim().toLowerCase()])] : tags;
    store.setFavorite(storyKey, all);
    setOpen(false);
  };
  const remove = () => {
    store.setFavorite(storyKey, null);
    setOpen(false);
  };

  const suggestions = known.filter((t) => !tags.includes(t) && t.startsWith(input.trim().toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => (open ? setOpen(false) : openPopover())} aria-expanded={open} className={favorite ? 'text-neutral-900 dark:text-neutral-100' : 'hover:text-neutral-900 dark:hover:text-neutral-100'}>
        {favorite ? '★ Saved' : '☆ Save'}
      </button>
      {open && (
        <div className={`absolute z-10 w-64 ${above ? 'bottom-full mb-2' : 'mt-2'} space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100`}>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button key={t} onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded-full bg-neutral-200 px-2 text-xs hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600" aria-label={`Remove tag ${t}`}>{t} ×</button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
            autoFocus
            placeholder="Add a tag (optional), Enter to save"
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((t) => <button key={t} onClick={() => addTag(t)} className="rounded-full border border-dashed border-neutral-400 px-2 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">+ {t}</button>)}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={save} className="rounded bg-neutral-900 px-3 py-0.5 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">{favorite ? 'Update' : 'Save'}</button>
            {favorite && <button onClick={remove} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">Unsave</button>}
          </div>
        </div>
      )}
    </div>
  );
}
