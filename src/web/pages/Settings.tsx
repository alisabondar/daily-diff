import type { ReactNode } from 'react';
import { KeywordInput, TopicPicker, field } from '../components/Preferences';
import { FRONT_PAGE_MAX, rankAll } from '../data/rank';
import { useStore } from '../data/store';
import { useDay } from '../data/use-day';

const label = 'block space-y-1 text-sm';

export function Settings({ account }: { account?: ReactNode }) {
  const { state, update } = useStore();
  const { scrub } = useDay();
  const all = scrub ? rankAll(scrub.stories, state) : null;
  const passing = all?.filter((x) => x.rank >= state.relevanceThreshold).length ?? 0;
  const set = (patch: Partial<typeof state>) => update((s) => ({ ...s, ...patch }), { settings: true });
  return (
    <div className="space-y-8">
      {account}
      <section className="space-y-2">
        <h2 className="font-semibold">Topics</h2>
        <p className="text-sm text-neutral-500">Stories on these topics rank higher.</p>
        <TopicPicker value={state.topics} onChange={(topics) => set({ topics })} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Keywords</h2>
        <p className="text-sm text-neutral-500">A story mentioning any of these ranks a little higher.</p>
        <KeywordInput value={state.keywords} onChange={(keywords) => set({ keywords })} />
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span>Highlights on the front page</span>
          <input type="number" min={4} max={20} value={state.highlightsCap} onChange={(e) => { const n = Number(e.target.value); if (n >= 4 && n <= 20) set({ highlightsCap: n }); }} className={field} />
        </label>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">How picky is the front page?</h2>
        <p className="text-sm text-neutral-500">
          Each story gets a score from the scrub, plus 2 if it's on one of your topics and 1 if it mentions a keyword. The front page shows stories at or above this number, up to {FRONT_PAGE_MAX}.
        </p>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={10} step={1} value={state.relevanceThreshold} onChange={(e) => set({ relevanceThreshold: Number(e.target.value) })} aria-label="Relevance threshold" className="w-full accent-neutral-700 dark:accent-neutral-300" />
          <span className="w-6 text-right font-semibold tabular-nums">{state.relevanceThreshold}</span>
        </div>
        <div className="flex justify-between text-xs text-neutral-500">
          <span>0 · no filter, everything in your packs</span>
          <span className="text-right">10 · only top stories that match your topics</span>
        </div>
        {all && (
          <p className="text-sm">
            Today, <strong>{passing}</strong> of {all.length} stories pass{passing > FRONT_PAGE_MAX ? `, so the front page shows the top ${FRONT_PAGE_MAX}` : ''}. The rest are under <a href="#/all" className="underline decoration-neutral-400 underline-offset-2">All stories</a>.
          </p>
        )}
      </section>
      {state.feedback.length > 0 && (
        <section className="space-y-1 text-sm">
          <h2 className="font-semibold">Less like this</h2>
          <p className="text-neutral-500">{state.feedback.length} {state.feedback.length === 1 ? 'story' : 'stories'} marked. Stories on the same topic or from the same source rank lower.</p>
          <button onClick={() => update((s) => ({ ...s, feedback: [] }))} className="text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100">Clear</button>
        </section>
      )}
      <p className="text-sm"><a href="#/privacy" className="underline decoration-neutral-400 underline-offset-2">Privacy</a></p>
    </div>
  );
}
