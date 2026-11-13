import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api, jsonBody } from '../api';
import { friendlyError } from '../components/Banner';

type Source = InferResponseType<typeof api.sources.$get>[number];
type Pack = InferResponseType<typeof api.packs.$get>[number];
type Found = Extract<InferResponseType<typeof api.sources.discover.$post>, { found: true }>;

const TYPES = ['news', 'blog', 'podcast', 'video', 'community'] as const;
const input = 'rounded border border-neutral-300 bg-paper px-2 py-1 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950';

function Health({ s }: { s: Source }) {
  const color = s.lastStatus === 'ok' ? 'bg-green-500' : s.lastStatus === 'error' ? 'bg-red-500' : 'bg-neutral-400';
  const label = s.lastStatus === 'error' ? friendlyError(s.lastError) : s.lastStatus === 'ok' ? 'Fetched fine' : 'Not fetched yet';
  return <span title={label} aria-label={label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
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
          <span className="min-w-0 flex-1">
            <span className="block truncate">{s.title} <span className="text-neutral-500">· {s.type}</span></span>
            {s.lastStatus === 'error' && <span className="block text-xs text-red-700 dark:text-red-400" title={s.lastError ?? undefined}>{friendlyError(s.lastError)}</span>}
          </span>
          <button onClick={() => setEditing(true)} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">Edit</button>
          {s.pack === null && <button onClick={() => confirm(`Delete “${s.title}”? Its past stories stay in your archive.`) && remove()} className="text-neutral-500 hover:text-red-700 dark:hover:text-red-400">Delete</button>}
        </>
      )}
    </li>
  );
}

/** A discovered feed's preview, type picker and Add button, shared by Add source and suggestions. */
function FeedPreview({ found, pageUrl, onAdded }: { found: Found; pageUrl: string; onAdded: () => void }) {
  const [type, setType] = useState<Source['type']>(found.suggestedType);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const res = await api.sources.$post({}, jsonBody({ feedUrl: found.feedUrl, title: found.title, url: pageUrl, type }));
    if (!res.ok) return setError(((await res.json()) as { error?: string }).error ?? 'Could not add the source.');
    onAdded();
  };
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{found.title}</p>
      <ul className="list-disc pl-5 text-neutral-500">
        {found.preview.map((p, i) => <li key={i}><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></li>)}
      </ul>
      <div className="flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as Source['type'])} className={input}>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button onClick={save} className="rounded bg-neutral-900 px-3 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900">Add source</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

type Suggestion = Extract<InferResponseType<typeof api.sources.suggest.$post>, { ok: true }>['suggestions'][number];

/** One suggestion: nothing is fetched until Check (step 30, rule 7). */
function SuggestionRow({ s, onAdded, onDismiss }: { s: Suggestion; onAdded: () => void; onDismiss: () => void }) {
  const [state, setState] = useState<'idle' | 'checking' | 'none' | Found>('idle');
  const check = async () => {
    setState('checking');
    const r = await (await api.sources.discover.$post({}, jsonBody({ url: s.siteUrl }))).json();
    setState(r.found ? r : 'none');
  };
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p><span className="font-medium">{s.title}</span> <span className="text-neutral-500">· {new URL(s.siteUrl).hostname.replace(/^www\./, '')}</span></p>
          <p className="text-neutral-500">{s.why}</p>
        </div>
        {(state === 'idle' || state === 'checking') && <button onClick={check} disabled={state === 'checking'} className="rounded border border-neutral-400 px-2 py-0.5 disabled:opacity-40">{state === 'checking' ? 'Checking…' : 'Check'}</button>}
        <button onClick={onDismiss} aria-label={`Dismiss ${s.title}`} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">×</button>
      </div>
      {state === 'none' && <p className="text-neutral-500">No RSS or Atom feed found for this site.</p>}
      {typeof state === 'object' && <FeedPreview found={state} pageUrl={s.siteUrl} onAdded={() => { onAdded(); onDismiss(); }} />}
    </li>
  );
}

/** Step 30: on demand only, since each run costs tokens. Suggestions aren't stored. */
function SuggestSources({ onAdded }: { onAdded: () => void }) {
  const [hasProfile, setHasProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.settings.$get().then(async (r) => setHasProfile(!!(await r.json()).profile?.trim()));
  }, []);
  if (!hasProfile) return null;
  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await api.sources.suggest.$post();
    const body = (await res.json()) as { ok?: boolean; suggestions?: Suggestion[]; message?: string; error?: string };
    setBusy(false);
    if (body.ok && body.suggestions) setList(body.suggestions);
    else setError(body.error ?? body.message ?? "Couldn’t get suggestions.");
  };
  return (
    <section className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Suggested for your profile</h2>
        <button onClick={run} disabled={busy} className="text-sm text-neutral-500 underline hover:text-neutral-900 disabled:opacity-40 dark:hover:text-neutral-100">{busy ? 'Thinking…' : list ? 'Suggest again' : 'Suggest sources for my profile'}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && list.length === 0 && <p className="text-sm text-neutral-500">No new suggestions. Your sources already cover it.</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {list.map((s) => <SuggestionRow key={s.siteUrl} s={s} onAdded={onAdded} onDismiss={() => setList((l) => l?.filter((x) => x !== s) ?? null)} />)}
        </ul>
      )}
    </section>
  );
}

function AddSource({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const discover = async () => {
    setBusy(true);
    setFound(null);
    setReason(null);
    const r = await (await api.sources.discover.$post({}, jsonBody({ url }))).json();
    setBusy(false);
    if (r.found) setFound(r);
    else setReason(r.reason);
  };
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">Add source</h2>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && !busy && discover()} placeholder="Paste a site or feed URL" className={`${input} flex-1`} />
        <button onClick={discover} disabled={!url.trim() || busy} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900">{busy ? 'Looking…' : 'Find feed'}</button>
      </div>
      {reason && (
        <p className="text-sm text-neutral-500">No feed found. Daily Diff only supports RSS and Atom feeds. {reason}</p>
      )}
      {found && <FeedPreview found={found} pageUrl={URL.canParse(url) ? url : new URL(found.feedUrl).origin} onAdded={() => { setUrl(''); setFound(null); onAdded(); }} />}
    </section>
  );
}

export function Sources() {
  const [list, setList] = useState<Source[] | null>(null);
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

  if (!list) return null;
  const custom = list.filter((s) => s.pack === null);
  return (
    <div className="space-y-5">
      <AddSource onAdded={load} />
      <SuggestSources onAdded={load} />
      {packs.map((p) => (
        <section key={p.id}>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={p.enabled} onChange={(e) => togglePack(p.id, e.target.checked)} />
            {p.emoji} {p.name}
            <span className="text-sm font-normal text-neutral-500">· {list.filter((s) => s.pack === p.id).length} sources{p.enabled ? '' : ', off'}</span>
          </label>
          {p.enabled && <ul className="divide-y divide-neutral-200 pl-6 dark:divide-neutral-800">
            {list.filter((s) => s.pack === p.id).map((s) => <SourceRow key={s.id} s={s} onChange={load} />)}
          </ul>}
        </section>
      ))}
      <section>
        <h2 className="font-semibold">Your own sources</h2>
        {custom.length === 0 && <p className="pl-6 text-sm text-neutral-500">None yet. Paste a site or feed URL above to add one.</p>}
        <ul className="divide-y divide-neutral-200 pl-6 dark:divide-neutral-800">
          {custom.map((s) => <SourceRow key={s.id} s={s} onChange={load} />)}
        </ul>
      </section>
    </div>
  );
}
