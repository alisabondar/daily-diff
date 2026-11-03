import { useEffect, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import { api, jsonBody } from '../api';
import { field, formFrom, PROFILE_PLACEHOLDER, ProviderFields, withoutEnv, type ProviderForm, type SettingsData } from './Settings';

type Pack = InferResponseType<typeof api.packs.$get>[number];

const EXAMPLE_PROFILES = [
  'Backend engineer. Interested in databases, distributed systems and developer tooling. Skip consumer gadgets.',
  'ML engineer shipping LLM features. Care about new models, evals, inference cost and open-weight releases.',
  'Engineering manager. Want industry headlines, team practices and the occasional deep technical read.',
];

const STEPS = ['Provider', 'Profile', 'Packs'];
const primary = 'rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900';

export function Onboarding({ onFinish }: { onFinish: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [tested, setTested] = useState(false);
  const [profile, setProfile] = useState('');
  const [packs, setPacks] = useState<Pack[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await (await api.settings.$get()).json();
      setSettings(s);
      setForm(formFrom(s, s.provider ?? s.providers.find((p) => p.keySource !== 'none')?.id));
      setProfile(s.profile);
      const p = await (await api.packs.$get()).json();
      setPacks(p);
      setChosen(p.filter((x) => x.defaultEnabled).map((x) => x.id));
    })();
  }, []);

  if (!settings || !form) return null;

  const saveProvider = async () => {
    await api.settings.$put({}, jsonBody({
      ...withoutEnv(settings, { provider: form.provider, fastModel: form.fastModel, strongModel: form.strongModel }),
      ...(form.provider === 'ollama' ? { baseUrl: form.baseUrl } : {}),
    }));
    setStep(1);
  };
  const saveProfile = async (value: string) => {
    await api.settings.$put({}, jsonBody({ profile: value }));
    setStep(2);
  };
  const finish = async () => {
    setBusy(true);
    await api.packs.$post({}, jsonBody({ enabled: chosen }));
    await api.onboarding.complete.$post();
    await onFinish();
  };

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold">Welcome to Daily Diff</h1>
      <ol className="flex gap-6 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'font-semibold' : 'text-neutral-500'}>{i + 1}. {s}</li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-6">
          <ProviderFields settings={settings} form={form} setForm={setForm} onTested={setTested} onRefresh={setSettings} />
          <button onClick={saveProvider} disabled={!tested} className={primary}>Next</button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <p className="text-sm text-neutral-500">Tell Daily Diff what you care about. It uses this to rank stories.</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROFILES.map((p) => (
              <button key={p} onClick={() => setProfile(p)} className="rounded-full bg-neutral-100 px-3 py-1 text-left text-xs dark:bg-neutral-800">{p.split('.')[0]}</button>
            ))}
          </div>
          <textarea value={profile} onChange={(e) => setProfile(e.target.value)} rows={5} placeholder={PROFILE_PLACEHOLDER} className={field} />
          <div className="flex gap-4">
            <button onClick={() => saveProfile(profile)} className={primary}>Next</button>
            <button onClick={() => setStep(2)} className="text-sm text-neutral-500">Skip</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <ul className="space-y-2">
            {packs.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chosen.includes(p.id)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))}
                  />
                  {p.emoji} {p.name} <span className="text-sm text-neutral-500">· {p.sourceCount} sources</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="text-sm text-neutral-500">Back</button>
            <button onClick={finish} disabled={busy} className={primary}>Finish</button>
          </div>
        </section>
      )}
    </div>
  );
}
