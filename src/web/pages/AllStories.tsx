import { rankAll } from '../data/rank';
import { useStore } from '../data/store';
import { useDay } from '../data/use-day';
import { TOPIC_LABEL, TOPIC_ORDER, topicColor } from '../topics';
import { MoreItem } from './Today';

/** Every story in the viewer's packs for one day, ignoring the relevance threshold and the front-page cap. */
export function AllStories({ date }: { date?: string }) {
  const { state } = useStore();
  const { latest, shown, scrub, missing, error } = useDay(date);
  const all = scrub ? rankAll(scrub.stories, state) : [];
  const groups = TOPIC_ORDER.map((t) => ({ key: t, label: TOPIC_LABEL[t]!, color: topicColor(t), stories: all.filter((s) => s.topic === t) }));
  const day = shown ? new Date(`${shown}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase() : '';

  return (
    <div>
      <a href={date ? `#/d/${date}` : '#/'} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">← Back to the front page</a>
      {error && <p className="text-neutral-500">Couldn’t load the digest: {error}</p>}
      {latest === null && !date && <p className="text-neutral-500">No digest has been published yet.</p>}
      {missing && <p className="text-neutral-500">No digest for {shown}.</p>}
      {scrub && (
        <>
          <header className="mt-4 border-b border-neutral-400 pb-3">
            <h1 className="text-2xl font-semibold tracking-tight">All stories</h1>
            <p className="mt-1 text-sm text-neutral-500">{day} · {all.length} in your packs, highest ranked first, including those below your relevance threshold</p>
          </header>
          <div className="mt-4 space-y-6">
            {groups.filter((g) => g.stories.length).map((g) => (
              <section key={g.key}>
                <h2 className="border-b pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: g.color, borderColor: g.color }}>{g.label} · {g.stories.length}</h2>
                <ul>{g.stories.map((s) => <MoreItem key={s.key} story={s} />)}</ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
