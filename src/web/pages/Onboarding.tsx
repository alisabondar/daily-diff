import { useState } from 'react';
import type { Topic } from '../../shared/enums.js';
import { KeywordInput, TopicPicker, primary } from '../components/Preferences';
import { defaultPacksFor } from '../data/pack-defaults';
import { PACKS } from '../data/packs';
import { useStore } from '../data/store';

const STEPS = ['Interests', 'Packs'];
const TOTAL_SOURCES = PACKS.reduce((n, p) => n + p.sourceCount, 0);
const PERKS = [
  ['One read a morning', 'A fresh front page by breakfast.'],
  ['Ranked for you', 'Your topics and keywords rise to the top.'],
  ['Keep a streak', 'Finish the day with a quick quiz.'],
] as const;

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
    <div className="mx-auto max-w-xl space-y-8">
      <header className="space-y-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Welcome to</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">The Daily Diff</h1>
        <p className="text-lg leading-relaxed text-neutral-700 sm:text-xl dark:text-neutral-300">
          Every morning, {TOTAL_SOURCES} sources of AI and engineering news get read, deduplicated and ranked, so you only see what changed and what matters to you.
        </p>
        <ol className="grid gap-x-8 gap-y-4 pt-4 sm:grid-cols-3">
          {PERKS.map(([title, body], i) => (
            <li key={title} className="border-t border-neutral-300 pt-3 dark:border-neutral-700">
              <div className="text-xs tabular-nums text-neutral-500">0{i + 1}</div>
              <div className="mt-1 text-sm font-semibold">{title}</div>
              <div className="text-sm text-neutral-500">{body}</div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-neutral-500">Your choices stay on this device unless you sign in to sync.</p>
      </header>
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
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${chosen.includes(p.id) ? 'border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900' : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'}`}>
                  <input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => { setPacksTouched(true); setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id)); }} />
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-auto text-sm text-neutral-500">{p.sourceCount} {p.sourceCount === 1 ? 'source' : 'sources'}</span>
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
