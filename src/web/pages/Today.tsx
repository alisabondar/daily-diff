import { useEffect, useState } from 'react';
import { api, type Digest, type Status } from '../api';
import { Banner } from '../components/Banner';
import { LearnSection } from '../components/LearnSection';
import { ProgressStrip } from '../components/ProgressStrip';
import { StoryCard } from '../components/StoryCard';

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
          {groups.map((g) => (
            <section key={g.section} className="mb-8">
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
