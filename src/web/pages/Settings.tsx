import type { ReactNode } from 'react';
import { KeywordInput, TopicPicker, field } from '../components/Preferences';
import { useStore } from '../data/store';

const label = 'block space-y-1 text-sm';

export function Settings({ account }: { account?: ReactNode }) {
  const { state, update } = useStore();
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
        <label className={label}>
          <span>Relevance threshold (0–10)</span>
          <input type="number" min={0} max={10} value={state.relevanceThreshold} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n <= 10) set({ relevanceThreshold: n }); }} className={field} />
        </label>
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
