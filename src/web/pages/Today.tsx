import { useEffect, useState } from 'react';
import { api, type Digest, type Status } from '../api';
import { Banner } from '../components/Banner';
import { LearnSection } from '../components/LearnSection';
import { ProgressStrip } from '../components/ProgressStrip';
import { StoryCard } from '../components/StoryCard';

// Scroll instead of #anchors: the hash is the router's.
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const LABELS: Record<string, string> = {
  models: '🧠 Model Releases',
  tools: '🛠 Tools',
  headlines: '📰 Headlines',
  watch: '🎬 Watch',
  'long-reads': 'Long reads',
  podcasts: 'Podcasts',
  videos: 'Videos',
  other: 'Other',
};

// `date` set: an archived digest (#/d/:date). Unset: today, or the latest done digest while today builds.
export function Today({ status, date }: { status: Status; date?: string }) {
  const [tab, setTab] = useState<'highlights' | 'more'>('highlights');
  const [digest, setDigest] = useState<Digest | null>(null);
  const [missing, setMissing] = useState(false);
  const shown = date ?? (status.today?.status === 'done' ? status.today.date : status.latestDoneDate);

  useEffect(() => {
    setDigest(null);
    setMissing(false);
    setTab('highlights');
    if (!shown) return;
    api.digests[':date'].$get({ param: { date: shown } }).then(async (res) => {
      if (res.ok) setDigest(await res.json());
      else setMissing(true);
    });
  }, [shown]);

  const groups = digest ? digest[tab] : [];
  const empty = digest && digest.highlights.length === 0 && digest.more.length === 0;
  return (
    <div>
      {!date && status.progress.running && <ProgressStrip message={status.progress.message} />}
      {digest && <Banner isRaw={digest.meta.isRaw} errorCode={digest.meta.errorCode} failedSources={date ? [] : status.failedSources} />}
      {!shown && !status.progress.running && <p className="text-neutral-500">No digest yet.</p>}
      {missing && <p className="text-neutral-500">No digest for {shown}.</p>}
      {digest && (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold">{digest.meta.date}</h1>
            <div className="flex gap-4 text-sm">
              {(['highlights', 'more'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={tab === t ? 'font-semibold' : 'text-neutral-500'}>
                  {t === 'highlights' ? 'Highlights' : 'More'}
                </button>
              ))}
            </div>
          </div>
          {empty && !digest.meta.isRaw && <p className="py-6 text-neutral-500">Quiet day — nothing above your relevance threshold.</p>}
          {(groups.length > 0 || (tab === 'highlights' && digest.learn)) && (
            <nav aria-label="Sections" className="mb-2 flex flex-wrap gap-2 text-sm">
              {groups.map((g) => (
                <button key={g.section} onClick={() => jump(`sec-${g.section}`)} className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800">
                  {LABELS[g.section] ?? g.section} <span className="text-neutral-500">{g.stories.length}</span>
                </button>
              ))}
              {tab === 'highlights' && digest.learn && (
                <button onClick={() => jump('sec-learn')} className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800">📚 Learn</button>
              )}
            </nav>
          )}
          {groups.map((g) => (
            <section key={g.section} id={`sec-${g.section}`} className="mb-8 scroll-mt-4">
              <h2 className="mt-6 text-xl font-semibold">{LABELS[g.section] ?? g.section}</h2>
              {g.stories.map((s) => <StoryCard key={s.id} story={s} />)}
            </section>
          ))}
          {tab === 'highlights' && digest.learn && <LearnSection learn={digest.learn} />}
        </>
      )}
    </div>
  );
}
