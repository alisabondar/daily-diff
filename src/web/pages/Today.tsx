import { useEffect, useRef, useState } from 'react';
import { api, postRead, type Digest, type ReadBody, type Status, type Streak, type StoryT } from '../api';
import { FinishLine, streakText } from '../components/FinishLine';
import { Banner } from '../components/Banner';
import { FavoriteButton } from '../components/FavoriteButton';
import { Actions, ModelDetails, videoLink } from '../components/StoryCard';
import { LearnSection } from '../components/LearnSection';
import { ProgressStrip } from '../components/ProgressStrip';
import { TOPIC_LABEL, TOPIC_ORDER, topicColor } from '../topics';

// "Calm" front page (from /fmk, design G): numbered top 3 with margin notes, then everything else by topic.
const MORE_LABEL: Record<string, string> = { 'long-reads': 'Long reads', podcasts: 'Podcasts', videos: 'Videos', other: 'Other' };

function TopStory({ story, n }: { story: StoryT; n: number }) {
  const color = topicColor(story.topic);
  const link = story.links[0];
  return (
    <article className="py-5 sm:grid sm:grid-cols-[5.5rem_1fr] sm:gap-5">
      <div className="mb-1 flex items-baseline gap-2 text-xs leading-relaxed text-neutral-500 sm:mb-0 sm:block sm:border-r sm:border-neutral-400/50 sm:pr-4 sm:text-right">
        <div className="text-2xl font-bold leading-none sm:text-3xl" style={{ color }}>{n}</div>
        {story.topic !== 'other' && <div className="font-semibold sm:mt-1" style={{ color }}>{TOPIC_LABEL[story.topic] ?? 'Other'}</div>}
        <div>{story.readMinutes} min</div>
        {link && <div className="truncate">{link.sourceTitle}{story.links.length > 1 ? ` +${story.links.length - 1}` : ''}</div>}
      </div>
      <div>
        <h2 className="text-xl font-semibold leading-snug">
          {link ? <a href={link.url} target="_blank" rel="noreferrer" className="hover:underline">{story.title}</a> : story.title}
        </h2>
        {story.summary && <p className="mt-1.5 text-neutral-600 dark:text-neutral-300">{story.summary}</p>}
        <ModelDetails story={story} />
        <Actions story={story} />
      </div>
    </article>
  );
}

function MoreItem({ story }: { story: StoryT }) {
  const [favorite, setFavorite] = useState(story.favorite);
  const link = story.links[0];
  const video = videoLink(story);
  return (
    <li className="py-1.5">
      {link ? <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:underline">{story.title}</a> : <span className="font-semibold">{story.title}</span>}
      <div className="mt-0.5 flex items-start gap-3 text-xs text-neutral-500">
        <span>{link?.sourceTitle} · {story.readMinutes} min</span>
        {video && video !== link?.url && <a href={video} target="_blank" rel="noreferrer" className="hover:text-neutral-900 dark:hover:text-neutral-100">▶ Watch</a>}
        <FavoriteButton storyId={story.id} favorite={favorite} onChange={setFavorite} />
      </div>
    </li>
  );
}

// `date` set: an archived digest (#/d/:date). Unset: today, or the latest done digest while today builds.
export function Today({ status, date }: { status: Status; date?: string }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [missing, setMissing] = useState(false);
  const shown = date ?? (status.today?.status === 'done' ? status.today.date : status.latestDoneDate);
  // Reading only counts toward the streak on today's digest (step 26).
  const isToday = !date && !!shown && shown === status.today?.date;
  const [streak, setStreak] = useState<Streak | null>(null);
  const record = isToday ? (b: ReadBody) => { postRead(b).then(setStreak); } : null;
  const end = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!date) api.streak.$get().then(async (r) => setStreak(await r.json()));
  }, [date]);

  useEffect(() => {
    setDigest(null);
    setMissing(false);
    if (!shown) return;
    api.digests[':date'].$get({ param: { date: shown } }).then(async (res) => {
      if (res.ok) setDigest(await res.json());
      else setMissing(true);
    });
  }, [shown]);

  const highlights = digest ? digest.highlights.flatMap((g) => g.stories) : [];
  const top = highlights.slice(0, 3);
  const rest = digest ? [...highlights.slice(3), ...digest.more.flatMap((g) => g.stories)] : [];
  // Raw digests have no topics; fall back to their More sections.
  const byTopic = rest.some((s) => s.topic !== 'other');
  const groups = byTopic
    ? TOPIC_ORDER.map((t) => ({ key: t, label: TOPIC_LABEL[t]!, color: topicColor(t), stories: rest.filter((s) => s.topic === t) }))
    : (digest?.more ?? []).map((g) => ({ key: g.section, label: MORE_LABEL[g.section] ?? g.section, color: topicColor('other'), stories: g.stories }));
  const all = [...top, ...rest];
  const releases = all.filter((s) => s.category === 'model').length;
  const since = digest ? new Date(digest.meta.windowStart).toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase() : '';

  useEffect(() => {
    const el = end.current;
    if (!isToday || !el) return;
    let sent = false;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !sent) { sent = true; postRead({ kind: 'finished' }).then(setStreak); io.disconnect(); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [isToday, digest]);
  const minutes = all.reduce((a, s) => a + s.readMinutes, 0);
  const day = shown ? new Date(`${shown}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase() : '';

  return (
    <div>
      {!date && status.progress.running && <ProgressStrip message={status.progress.message} showing={shown && shown !== status.today?.date ? shown : null} />}
      {digest && <Banner isRaw={digest.meta.isRaw} errorCode={digest.meta.errorCode} failedSources={date ? [] : status.failedSources} />}
      {!shown && !status.progress.running && <p className="text-neutral-500">No digest yet.</p>}
      {missing && <p className="text-neutral-500">No digest for {shown}.</p>}
      {digest && (
        <>
          <header className="border-b border-neutral-400 pb-3 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">The Daily Diff</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {[digest.meta.isRaw ? 'today’s raw feed' : 'a calm morning read', day, `${all.length} ${all.length === 1 ? 'story' : 'stories'} since ${since}`, ...(releases ? [`${releases} model ${releases === 1 ? 'release' : 'releases'}`] : []), `${minutes} min`].map((part, i) => (
                <span key={i}>{i > 0 && ' · '}<span className="whitespace-nowrap">{part}</span></span>
              ))}
            </p>
            {!date && streak && <p className="mt-1 text-xs text-neutral-500">{streakText(streak)}{streak.readToday ? ' · read today ✓' : ''}</p>}
          </header>
          {all.length === 0 && !digest.meta.isRaw && <p className="py-10 text-center text-neutral-500">Quiet day — nothing above your relevance threshold.</p>}
          {top.length > 0 && <div className="divide-y divide-neutral-200 dark:divide-neutral-800">{top.map((s, i) => <TopStory key={s.id} story={s} n={i + 1} />)}</div>}
          {groups.some((g) => g.stories.length) && (
            <section className="mt-6 border-t border-neutral-400 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{top.length ? 'More by topic' : 'Today by section'}</h2>
              <div className="mt-3 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {groups.filter((g) => g.stories.length).map((g) => (
                  <div key={g.key}>
                    <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: g.color, borderColor: g.color }}>{g.label} · {g.stories.length}</h3>
                    <ul>{g.stories.map((s) => <MoreItem key={s.id} story={s} />)}</ul>
                  </div>
                ))}
              </div>
            </section>
          )}
          {digest.learn && <LearnSection learn={digest.learn} />}
          {digest.learn?.concept.quiz?.length ? <FinishLine quiz={digest.learn.concept.quiz} concept={digest.learn.concept.title} record={record} streak={streak} /> : null}
          {all.length > 0 && <p ref={end} className="mt-10 text-center text-sm italic text-neutral-500">That’s all. Go make something.</p>}
        </>
      )}
    </div>
  );
}
