import { useEffect, useRef, useState } from 'react';
import { api, jsonBody } from '../api';

type Favorite = { tags: string[] } | null;

export function FavoriteButton({ storyId, favorite, onChange }: { storyId: number; favorite: Favorite; onChange: (f: Favorite) => void }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(favorite?.tags ?? []);
  const [input, setInput] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openPopover = async () => {
    setTags(favorite?.tags ?? []);
    setOpen(true);
    const res = await api.favorites.$get({ query: {} });
    setKnown((await res.json()).tags.map((t) => t.tag));
  };
  const addTag = (t: string) => {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setInput('');
  };
  const save = async () => {
    const all = input.trim() ? [...new Set([...tags, input.trim().toLowerCase()])] : tags;
    await api.favorites[':storyId'].$put({ param: { storyId: String(storyId) } }, jsonBody({ tags: all }));
    onChange({ tags: all });
    setOpen(false);
  };
  const remove = async () => {
    await api.favorites[':storyId'].$delete({ param: { storyId: String(storyId) } });
    onChange(null);
    setOpen(false);
  };

  const suggestions = known.filter((t) => !tags.includes(t) && t.startsWith(input.trim().toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => (open ? setOpen(false) : openPopover())} aria-expanded={open} className={favorite ? 'text-neutral-900 dark:text-neutral-100' : 'hover:text-neutral-900 dark:hover:text-neutral-100'}>
        {favorite ? '★ Saved' : '☆ Save'}
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-64 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button key={t} onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded-full bg-neutral-200 px-2 text-xs hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600" aria-label={`Remove tag ${t}`}>{t} ×</button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(input); if (e.key === 'Escape') setOpen(false); }}
            autoFocus
            placeholder="Add a tag (optional)"
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
