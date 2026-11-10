import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api, jsonBody } from '../api';

export type SettingsData = InferResponseType<typeof api.settings.$get>;
type Provider = SettingsData['providers'][number]['id'];
export interface ProviderForm { provider?: Provider; fastModel: string; strongModel: string; baseUrl: string }
type TestResult = InferResponseType<typeof api.settings.test.$post>;

export const field = 'w-full rounded border border-neutral-300 bg-neutral-50 px-3 py-2 placeholder:text-neutral-400 disabled:border-dashed disabled:bg-transparent disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-transparent';
const label = 'block space-y-1 text-sm';

export const formFrom = (s: SettingsData, provider = s.provider): ProviderForm => ({
  provider,
  fastModel: (provider === s.provider ? s.fastModel : undefined) ?? (provider ? s.suggestedModels[provider].fast : ''),
  strongModel: (provider === s.provider ? s.strongModel : undefined) ?? (provider ? s.suggestedModels[provider].strong : ''),
  baseUrl: s.baseUrl ?? '',
});

/** Provider, models, key, base URL and Test connection. Shared with onboarding. */
export function ProviderFields({ settings, form, setForm, onTested, onRefresh }: { settings: SettingsData; form: ProviderForm; setForm: (f: ProviderForm) => void; onTested?: (ok: boolean) => void; onRefresh: (s: SettingsData) => void }) {
  const [test, setTest] = useState<TestResult | 'running' | null>(null);
  const p = settings.providers.find((x) => x.id === form.provider);
  const fromEnv = (f: string) => settings.envOverrides.fields.includes(f as never);
  const envNote = <span className="text-xs text-neutral-500"> · set in .env</span>;
  const update = (f: ProviderForm) => {
    setForm(f);
    setTest(null);
    onTested?.(false);
  };
  const runTest = async () => {
    if (!form.provider) return;
    setTest('running');
    const body = { provider: form.provider, fastModel: form.fastModel || undefined, strongModel: form.strongModel || undefined, baseUrl: form.baseUrl || undefined };
    const r = await (await api.settings.test.$post({}, jsonBody(body))).json();
    setTest(r);
    onTested?.(r.ok);
    onRefresh(await (await api.settings.$get()).json()); // picks up a key just added to .env
  };

  return (
    <div className="space-y-4">
      {settings.envOverrides.invalid.map((v) => (
        <p key={v.name} className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-950">
          Ignoring {v.name}={v.value} from .env: not a supported value.
        </p>
      ))}
      <label className={label}>
        <span>Provider{fromEnv('provider') && envNote}</span>
        <select disabled={fromEnv('provider')} value={form.provider ?? ''} onChange={(e) => update(formFrom(settings, e.target.value as Provider))} className={field}>
          <option value="" disabled>Choose a provider</option>
          {settings.providers.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
        </select>
      </label>
      {form.provider && (
        <>
          <label className={label}>
            <span>Fast model{fromEnv('fastModel') && envNote}</span>
            <input disabled={fromEnv('fastModel')} value={form.fastModel} onChange={(e) => update({ ...form, fastModel: e.target.value })} className={field} />
          </label>
          <label className={label}>
            <span>Strong model{fromEnv('strongModel') && envNote}</span>
            <input disabled={fromEnv('strongModel')} value={form.strongModel} onChange={(e) => update({ ...form, strongModel: e.target.value })} className={field} />
          </label>
          {p?.envVar && (
            <div className={label}>
              <span>API key</span>
              {p.keySource === 'env' ? (
                <p className="text-neutral-500">Using key from <code>{p.envVar}</code></p>
              ) : p.keySource === 'file' ? (
                <p className="text-neutral-500">Using {p.envVar} from {p.id === settings.provider && settings.keyFile ? settings.keyFile : 'a .env file'}</p>
              ) : (
                <div className="space-y-1 text-neutral-500">
                  <p>Add this line to <code>.env</code> in the folder you start Daily Diff from (or <code>{settings.envFile}</code>), then test the connection:</p>
                  <pre className="rounded bg-neutral-100 px-3 py-2 dark:bg-neutral-800">{p.envVar}=your-key-here</pre>
                </div>
              )}
            </div>
          )}
          {settings.effort && <p className="text-sm text-neutral-500">Reasoning effort: {settings.effort} · set in .env</p>}
          {form.provider === 'ollama' && (
            <label className={label}>
              <span>Base URL</span>
              <input value={form.baseUrl} onChange={(e) => update({ ...form, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" className={field} />
            </label>
          )}
          <div className="flex items-center gap-3 text-sm">
            <button onClick={runTest} disabled={test === 'running'} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
              {test === 'running' ? 'Testing…' : 'Test connection'}
            </button>
            {test && test !== 'running' && (test.ok ? <span className="text-green-600">✓ Connected</span> : <span className="text-red-600">{test.message}</span>)}
          </div>
        </>
      )}
    </div>
  );
}

/** Drops the fields .env overrides, so saving never writes env values into config.json. */
export const withoutEnv = <T extends object>(settings: SettingsData, values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([k]) => !settings.envOverrides.fields.includes(k as never))) as Partial<T>;

export const PROFILE_PLACEHOLDER = 'e.g. Backend engineer at a fintech startup. Interested in LLM tooling, Postgres and distributed systems. Not interested in crypto or gadget reviews.';

export function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [profile, setProfile] = useState('');
  const [cap, setCap] = useState(10);
  const [threshold, setThreshold] = useState(5);
  const [saved, setSaved] = useState<string | null>(null);

  const load = async () => {
    const s = await (await api.settings.$get()).json();
    setSettings(s);
    setForm(formFrom(s));
    setProfile(s.profile);
    setCap(s.highlightsCap);
    setThreshold(s.relevanceThreshold);
  };
  useEffect(() => {
    load();
  }, []);

  if (!settings || !form) return null;
  const save = async () => {
    const body = {
      ...(form.provider ? withoutEnv(settings, { provider: form.provider, fastModel: form.fastModel, strongModel: form.strongModel }) : {}),
      ...(form.provider === 'ollama' ? { baseUrl: form.baseUrl } : {}),
      profile,
      highlightsCap: cap,
      relevanceThreshold: threshold,
    };
    const res = await api.settings.$put({}, jsonBody(body));
    setSaved(res.ok ? '✓ Saved' : ((await res.json()) as { error?: string }).error ?? 'Could not save.');
    if (res.ok) {
      load();
      setTimeout(() => setSaved(null), 2500);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Model provider</h2>
        <ProviderFields settings={settings} form={form} setForm={setForm} onRefresh={setSettings} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your profile</h2>
        <p className="text-sm text-neutral-500">Daily Diff uses this to rank stories for you.</p>
        <textarea value={profile} onChange={(e) => setProfile(e.target.value)} rows={5} placeholder={PROFILE_PLACEHOLDER} className={field} />
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span>Top stories per day <span className="text-neutral-500">(4–20)</span></span>
          <input type="number" min={4} max={20} value={cap} onChange={(e) => setCap(Number(e.target.value))} className={field} />
          <span className="block text-xs text-neutral-500">How many stories make the front page.</span>
        </label>
        <label className={label}>
          <span>Relevance threshold <span className="text-neutral-500">(0–10)</span></span>
          <input type="number" min={0} max={10} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={field} />
          <span className="block text-xs text-neutral-500">Stories scored below this are left out.</span>
        </label>
      </section>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">Save settings</button>
        {saved && <span className="text-sm text-neutral-500">{saved}</span>}
      </div>
    </div>
  );
}
