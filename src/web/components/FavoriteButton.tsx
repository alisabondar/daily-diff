import { useState } from 'react';
import { api, jsonBody } from '../api';

type Favorite = { tags: string[] } | null;

export function FavoriteButton({ storyId, favorite, onChange }: { storyId: number; favorite: Favorite; onChange: (f: Favorite) => void }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(favorite?.tags ?? []);
  const [input, setInput] = useState('');
  const [known, setKnown] = useState<string[]>([]);

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
    <div className="relative">
      <button onClick={() => (open ? setOpen(false) : openPopover())} className="text-sm" aria-label="Favorite">
        {favorite ? '★ Saved' : '☆ Save'}
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-64 space-y-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button key={t} onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded bg-neutral-200 px-2 dark:bg-neutral-700">{t} ×</button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag(input)}
            placeholder="Add a tag"
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((t) => <button key={t} onClick={() => addTag(t)} className="text-neutral-500 underline">{t}</button>)}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={save} className="font-semibold">Save</button>
            {favorite && <button onClick={remove} className="text-neutral-500">Remove</button>}
          </div>
        </div>
      )}
    </div>
  );
}
