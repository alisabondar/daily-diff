import type { ReactNode } from 'react';
import { KeywordInput, TopicPicker } from '../components/Preferences';
import { FRONT_PAGE_MAX, rankAll } from '../data/rank';
import { useStore } from '../data/store';
import { useDay } from '../data/use-day';

/** Named front-page filter levels. Each one sets the stored 0–10 relevance threshold; ranking is unchanged. */
const LEVELS = [
  { name: 'Off', value: 0, hint: 'Every story in your packs can make the front page.' },
  { name: 'Light', value: 3, hint: 'Drops only the weakest matches.' },
  { name: 'Balanced', value: 5, hint: 'Keeps stories that fit your topics reasonably well.' },
  { name: 'Strict', value: 7, hint: 'Keeps stories that clearly match your topics.' },
] as const;

/** The level a stored threshold falls under: the highest level at or below it. */
const levelFor = (threshold: number) => [...LEVELS].reverse().find((l) => threshold >= l.value) ?? LEVELS[0];

const group = 'divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800';
const groupTitle = 'mb-2 text-sm font-semibold text-neutral-500';
const row = 'flex items-center justify-between gap-4 px-4 py-3';
const desc = 'text-sm text-neutral-500';

export function Settings({ account }: { account?: ReactNode }) {
  const { state, update } = useStore();
  const { scrub } = useDay();
  const all = scrub ? rankAll(scrub.stories, state) : null;
  const passing = all?.filter((x) => x.rank >= state.relevanceThreshold).length ?? 0;
  const level = levelFor(state.relevanceThreshold);
  const set = (patch: Partial<typeof state>) => update((s) => ({ ...s, ...patch }), { settings: true });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {account}
      <section>
        <h2 className={groupTitle}>Digest</h2>
        <div className={group}>
          <label className={row}>
            <span>Highlights</span>
            <select value={state.highlightsCap} onChange={(e) => set({ highlightsCap: Number(e.target.value) })} className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700">
              {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className={`${row} flex-wrap`}>
            <span>Filter</span>
            <div role="radiogroup" aria-label="Digest filter" className="inline-flex gap-0.5 rounded-md border border-neutral-300 p-0.5 dark:border-neutral-700">
              {LEVELS.map((l) => {
                const on = l === level;
                return (
                  <button key={l.name} type="button" role="radio" aria-checked={on} onClick={() => set({ relevanceThreshold: l.value })}
                    className={`rounded px-2.5 py-1 text-sm ${on ? 'bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'}`}>
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className={`mt-2 ${desc}`}>
          {level.hint}
          {all && <> Today {passing} of {all.length} stories pass{passing > FRONT_PAGE_MAX ? `; the top ${FRONT_PAGE_MAX} are shown` : ''}.</>}
        </p>
      </section>
      <section>
        <h2 className={groupTitle}>Interests</h2>
        <div className={group}>
          <div className="space-y-2 px-4 py-3">
            <div><p>Topics</p><p className={desc}>Stories on these topics rank higher.</p></div>
            <TopicPicker value={state.topics} onChange={(topics) => set({ topics })} />
          </div>
          <div className="space-y-2 px-4 py-3">
            <div><p>Keywords</p><p className={desc}>A story mentioning any of these ranks a little higher.</p></div>
            <KeywordInput value={state.keywords} onChange={(keywords) => set({ keywords })} />
          </div>
        </div>
      </section>
      {state.feedback.length > 0 && (
        <section>
          <h2 className={groupTitle}>Less like this</h2>
          <div className={group}>
            <div className={row}>
              <p className={desc}>{state.feedback.length} {state.feedback.length === 1 ? 'story' : 'stories'} marked. Stories on the same topic or from the same source rank lower.</p>
              <button onClick={() => update((s) => ({ ...s, feedback: [] }))} className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-sm hover:border-neutral-500 dark:border-neutral-700">Clear</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
