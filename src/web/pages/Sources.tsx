import { useEffect, useState } from 'react';
import { PACKS } from '../data/packs';
import { PUBLIC_ENV } from '../data/public-env';
import { useStore } from '../data/store';
import type { CatalogRow } from '../data/supabase';

/** The scrub's catalog: turn packs and single sources on or off for your view. New sources come in by suggestion or PR. */
export function Sources() {
  const { reader, state, update } = useStore();
  const [catalog, setCatalog] = useState<CatalogRow[] | null>(null);
  useEffect(() => {
    reader?.catalog().then(setCatalog, () => setCatalog([]));
  }, [reader]);
  if (!catalog) return null;

  const disabled = new Set(state.disabledSources);
  const togglePack = (id: string, on: boolean) => update((s) => ({ ...s, packs: on ? [...s.packs, id] : s.packs.filter((p) => p !== id) }), { settings: true });
  const toggleSource = (key: string, on: boolean) => update((s) => ({ ...s, disabledSources: on ? s.disabledSources.filter((k) => k !== key) : [...s.disabledSources, key] }), { settings: true });
  const suggestUrl = `https://github.com/${PUBLIC_ENV.githubRepo}/issues/new?template=suggest-source.yml`;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <p className="text-sm text-neutral-500">
        Every source below is read each morning. Turn off anything you don’t want to see.{' '}
        <a href={suggestUrl} target="_blank" rel="noreferrer" className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100">Suggest a source</a>
.
      </p>
      </div>
      {PACKS.map((p) => {
        const rows = catalog.filter((c) => c.pack === p.id);
        if (rows.length === 0) return null;
        const on = state.packs.includes(p.id);
        return (
          <section key={p.id} className="space-y-2">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={on} onChange={(e) => togglePack(p.id, e.target.checked)} />
              {p.emoji} {p.name}
            </label>
            <ul className={`space-y-1 pl-6 text-sm ${on ? '' : 'opacity-50'}`}>
              {rows.map((r) => (
                <li key={r.key}>
                  <label className="flex items-baseline gap-2">
                    <input type="checkbox" disabled={!on} checked={!disabled.has(r.key)} onChange={(e) => toggleSource(r.key, e.target.checked)} />
                    <span>{r.title}</span>
                    <a href={r.url} target="_blank" rel="noreferrer" className="truncate text-xs text-neutral-500 hover:underline">{r.url.replace(/^https:\/\/(www\.)?/, '')}</a>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
