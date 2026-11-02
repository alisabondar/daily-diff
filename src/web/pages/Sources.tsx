import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api, jsonBody } from '../api';

type Source = InferResponseType<typeof api.sources.$get>[number];
type Pack = InferResponseType<typeof api.packs.$get>[number];
type Found = Extract<InferResponseType<typeof api.sources.discover.$post>, { found: true }>;

const TYPES = ['news', 'blog', 'podcast', 'video', 'community'] as const;
const input = 'rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700';

function Health({ s }: { s: Source }) {
  const color = s.lastStatus === 'ok' ? 'bg-green-500' : s.lastStatus === 'error' ? 'bg-red-500' : 'bg-neutral-400';
  const label = s.lastStatus === 'error' ? s.lastError ?? 'error' : s.lastStatus === 'ok' ? 'ok' : 'never fetched';
  return <span title={label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function SourceRow({ s, onChange }: { s: Source; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [type, setType] = useState(s.type);
  const patch = async (p: { enabled?: boolean; title?: string; type?: Source['type'] }) => {
    await api.sources[':id'].$patch({ param: { id: String(s.id) } }, jsonBody(p));
    onChange();
  };
  const remove = async () => {
    await api.sources[':id'].$delete({ param: { id: String(s.id) } });
    onChange();
  };
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
      <Health s={s} />
      {editing ? (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} flex-1`} />
          <select value={type} onChange={(e) => setType(e.target.value as Source['type'])} className={input}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={async () => { await patch({ title, type }); setEditing(false); }} className="font-semibold">Save</button>
          <button onClick={() => { setTitle(s.title); setType(s.type); setEditing(false); }} className="text-neutral-500">Cancel</button>
        </>
      ) : (
        <>
          <span className="flex-1">{s.title} <span className="text-neutral-500">· {s.type}</span></span>
          <button onClick={() => setEditing(true)} className="text-neutral-500">Edit</button>
          {s.pack === null && <button onClick={remove} className="text-red-600">Delete</button>}
        </>
      )}
    </li>
  );
}

function AddSource({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [type, setType] = useState<Source['type']>('blog');
  const [error, setError] = useState<string | null>(null);

  const discover = async () => {
    setBusy(true);
    setFound(null);
    setReason(null);
    setError(null);
    const r = await (await api.sources.discover.$post({}, jsonBody({ url }))).json();
    setBusy(false);
    if (r.found) {
      setFound(r);
      setType(r.suggestedType);
    } else setReason(r.reason);
  };
  const save = async () => {
    if (!found) return;
    const page = URL.canParse(url) ? url : new URL(found.feedUrl).origin;
    const res = await api.sources.$post({}, jsonBody({ feedUrl: found.feedUrl, title: found.title, url: page, type }));
    if (!res.ok) return setError(((await res.json()) as { error?: string }).error ?? 'Could not add the source.');
    setUrl('');
    setFound(null);
    onAdded();
  };

  return (
    <section className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Add source</h2>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a site or feed URL" className={`${input} flex-1`} />
        <button onClick={discover} disabled={!url.trim() || busy} className="font-semibold disabled:opacity-50">{busy ? 'Looking…' : 'Find feed'}</button>
      </div>
      {reason && (
        <p className="text-sm text-neutral-500">No feed found — Daily Diff only supports RSS/Atom feeds. {reason}</p>
      )}
      {found && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{found.title}</p>
          <ul className="list-disc pl-5 text-neutral-500">
            {found.preview.map((p, i) => <li key={i}><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></li>)}
          </ul>
          <div className="flex items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as Source['type'])} className={input}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <button onClick={save} className="font-semibold">Save</button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}

export function Sources() {
  const [list, setList] = useState<Source[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const load = async () => {
    const [s, p] = await Promise.all([api.sources.$get(), api.packs.$get()]);
    setList(await s.json());
    setPacks(await p.json());
  };
  useEffect(() => {
    load();
  }, []);

  const togglePack = async (id: string, on: boolean) => {
    const enabled = packs.filter((p) => (p.id === id ? on : p.enabled)).map((p) => p.id);
    await api.packs.$post({}, jsonBody({ enabled }));
    load();
  };

  const custom = list.filter((s) => s.pack === null);
  return (
    <div className="space-y-8">
      <AddSource onAdded={load} />
      {packs.map((p) => (
        <section key={p.id}>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={p.enabled} onChange={(e) => togglePack(p.id, e.target.checked)} />
            {p.emoji} {p.name}
          </label>
          <ul className="divide-y divide-neutral-200 pl-6 dark:divide-neutral-800">
            {list.filter((s) => s.pack === p.id).map((s) => <SourceRow key={s.id} s={s} onChange={load} />)}
          </ul>
        </section>
      ))}
      <section>
        <h2 className="font-semibold">Custom</h2>
        {custom.length === 0 && <p className="pl-6 text-sm text-neutral-500">None yet.</p>}
        <ul className="divide-y divide-neutral-200 pl-6 dark:divide-neutral-800">
          {custom.map((s) => <SourceRow key={s.id} s={s} onChange={load} />)}
        </ul>
      </section>
    </div>
  );
}
