import { useEffect, useState } from 'react';
import { api, type Digest, type Status } from '../api';
import { StoryCard } from '../components/StoryCard';

const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/** One missed day's stories from a catch-up digest (#/d/:date/missed/:day, step 28). */
export function MissedDay({ status, date, day }: { status: Status; date: string; day: string }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api.digests[':date'].$get({ param: { date } }).then(async (res) => (res.ok ? setDigest(await res.json()) : setMissing(true)));
  }, [date]);

  const back = date === status.today?.date ? '#/' : `#/d/${date}`;
  const ids = new Set(digest?.missed.find((m) => m.date === day)?.storyIds ?? []);
  const stories = digest ? [...digest.highlights, ...digest.more].flatMap((g) => g.stories).filter((s) => ids.has(s.id)) : [];
  const others = digest?.missed.filter((m) => m.date !== day) ?? [];

  return (
    <div>
      <a href={back} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">‹ Back to the catch-up</a>
      <header className="mt-4 border-b border-neutral-400 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">What you missed on {longDay(day)}</h1>
        {digest && <p className="mt-1 text-sm text-neutral-500">{stories.length} {stories.length === 1 ? 'story' : 'stories'} from your catch-up</p>}
      </header>
      {missing && <p className="py-10 text-center text-neutral-500">No digest for {date}.</p>}
      {digest && stories.length === 0 && <p className="py-10 text-center text-neutral-500">Nothing from that day made the catch-up.</p>}
      {stories.map((s) => <StoryCard key={s.id} story={s} />)}
      {others.length > 0 && (
        <p className="mt-8 text-sm text-neutral-500">
          Other days:{' '}
          {others.map((m, i) => <span key={m.date}>{i > 0 && ' · '}<a href={`#/d/${date}/missed/${m.date}`} className="underline hover:text-neutral-900 dark:hover:text-neutral-100">{new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</a></span>)}
        </p>
      )}
    </div>
  );
}
