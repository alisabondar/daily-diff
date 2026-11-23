import { useState } from 'react';
import type { Topic } from '../../shared/enums.js';
import { KeywordInput, TopicPicker, primary } from '../components/Preferences';
import { defaultPacksFor } from '../data/pack-defaults';
import { PACKS } from '../data/packs';
import { useStore } from '../data/store';

const STEPS = ['Interests', 'Packs'];

/** Everything here stays on this device; Finish is the first moment the app may talk to the backend. */
export function Onboarding({ onFinish, signIn }: { onFinish: () => void; signIn?: React.ReactNode }) {
  const store = useStore();
  const [step, setStep] = useState(0);
  const [topics, setTopics] = useState<Topic[]>(store.state.topics);
  const [keywords, setKeywords] = useState<string[]>(store.state.keywords);
  const [chosen, setChosen] = useState<string[]>(store.state.packs);
  // Packs follow the topics until the user ticks a pack themselves.
  const [packsTouched, setPacksTouched] = useState(store.state.packs.length > 0);
  const toPacks = () => {
    if (!packsTouched) setChosen(defaultPacksFor(PACKS, topics));
    setStep(1);
  };

  const finish = () => {
    store.update((s) => ({ ...s, topics, keywords, packs: chosen, onboarded: true }), { settings: true });
    onFinish();
  };

  return (
    <div className="mx-auto max-w-xl space-y-8 rounded-xl border border-neutral-200 px-5 py-8 sm:px-8 dark:border-neutral-800">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to The Daily Diff</h1>
      <p className="text-sm text-neutral-500">One morning scrub of AI and engineering news, filtered for you. Your choices stay on this device unless you sign in to sync.</p>
      <ol className="flex gap-6 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold' : i < step ? 'text-neutral-700 dark:text-neutral-300' : 'text-neutral-500'}>{i < step ? '✓' : `${i + 1}.`} {s}</li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="font-semibold">Topics you care about</h2>
            <p className="text-sm text-neutral-500">Stories on these rank higher.</p>
            <TopicPicker value={topics} onChange={setTopics} />
          </div>
          <div className="space-y-2">
            <h2 className="font-semibold">Keywords <span className="font-normal text-neutral-500">(optional)</span></h2>
            <KeywordInput value={keywords} onChange={setKeywords} />
          </div>
          <button onClick={toPacks} className={primary}>Next</button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <p className="text-sm text-neutral-500">Picked for your topics. Change any of them.</p>
          <ul className="space-y-2">
            {PACKS.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => { setPacksTouched(true); setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id)); }} />
                  {p.emoji} {p.name} <span className="text-sm text-neutral-500">· {p.sourceCount} sources</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-4">
            <button onClick={() => setStep(0)} className="text-sm text-neutral-500">Back</button>
            <button onClick={finish} disabled={chosen.length === 0} className={primary}>Finish</button>
          </div>
        </section>
      )}
      {signIn}
    </div>
  );
}
