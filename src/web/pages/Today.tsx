import { useEffect, useRef, useState } from 'react';
import type { PublishedScrub } from '../../shared/published.js';
import { FinishLine, streakText } from '../components/FinishLine';
import { FavoriteButton } from '../components/FavoriteButton';
import { Actions, ModelDetails, videoLink, type StoryT } from '../components/StoryCard';
import { LearnSection, learnOf } from '../components/LearnSection';
import { rankView } from '../data/rank';
import { useStore } from '../data/store';
import { TOPIC_LABEL, TOPIC_ORDER, topicColor } from '../topics';

// "Calm" front page (from /fmk, design G): numbered top 3 with margin notes, then everything else by topic.

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
  const link = story.links[0];
  const video = videoLink(story);
  return (
    <li className="py-1.5">
      {link ? <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:underline">{story.title}</a> : <span className="font-semibold">{story.title}</span>}
      <div className="mt-0.5 flex items-start gap-3 text-xs text-neutral-500">
        <span>{link?.sourceTitle} · {story.readMinutes} min</span>
        {video && video !== link?.url && <a href={video} target="_blank" rel="noreferrer" className="hover:text-neutral-900 dark:hover:text-neutral-100">▶ Watch</a>}
        <FavoriteButton storyKey={story.key} />
      </div>
    </li>
  );
}

// `date` set: an archived day (#/d/:date). Unset: the latest published scrub.
export function Today({ date }: { date?: string }) {
  const store = useStore();
  const { reader, state } = store;
  const [latest, setLatest] = useState<string | null | undefined>(undefined);
  const [scrub, setScrub] = useState<PublishedScrub | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!reader || date) return;
    reader.dates().then((d) => setLatest(d[0] ?? null), (e: Error) => setError(e.message));
  }, [reader, date]);
  const shown = date ?? latest ?? null;
  // Reading counts toward the streak only on the latest scrub (step 26).
  const isToday = !date && !!shown;

  useEffect(() => {
    setScrub(null);
    setMissing(false);
    if (!reader || !shown) return;
    reader.day(shown).then((s) => (s ? setScrub(s) : setMissing(true)), (e: Error) => setError(e.message));
  }, [reader, shown]);

  const view = scrub ? rankView(scrub.stories, state) : null;
  const highlights = view ? view.highlights.flatMap((g) => g.stories) : [];
  const top = highlights.slice(0, 3);
  const rest = view ? [...highlights.slice(3), ...view.more.flatMap((g) => g.stories)] : [];
  const groups = TOPIC_ORDER.map((t) => ({ key: t, label: TOPIC_LABEL[t]!, color: topicColor(t), stories: rest.filter((s) => s.topic === t) }));
  const all = [...top, ...rest];
  const releases = all.filter((s) => s.category === 'model').length;
  const since = scrub ? new Date(scrub.windowStart).toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase() : '';
  const learn = scrub ? learnOf(scrub.learn) : null;
  const streak = shown ? store.streak(shown) : null;

  useEffect(() => {
    const el = end.current;
    if (!isToday || !el || !shown) return;
    let sent = false;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !sent) { sent = true; store.recordRead(shown, { kind: 'finished' }); io.disconnect(); }
    });
    io.observe(el);
    return () => io.disconnect();
    // store changes on every update; observe once per day shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, scrub, shown]);
  const minutes = all.reduce((a, s) => a + s.readMinutes, 0);
  const day = shown ? new Date(`${shown}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase() : '';

  return (
    <div>
      {error && <p className="text-neutral-500">Couldn’t load the digest: {error}</p>}
      {latest === null && !date && <p className="text-neutral-500">No digest has been published yet. The first one goes out at about 5:30am ET.</p>}
      {missing && <p className="text-neutral-500">No digest for {shown}.</p>}
      {scrub && (
        <>
          <header className="border-b border-neutral-400 pb-3 text-center">
            <h1 className="inline-flex items-center gap-3 text-4xl font-semibold tracking-tight"><img src="favicon.svg" alt="" className="h-[0.8em] w-[0.8em]" />The Daily Diff</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {['a calm morning read', day, `${all.length} ${all.length === 1 ? 'story' : 'stories'} since ${since}`, ...(releases ? [`${releases} model ${releases === 1 ? 'release' : 'releases'}`] : []), `${minutes} min`].map((part, i) => (
                <span key={i}>{i > 0 && ' · '}<span className="whitespace-nowrap">{part}</span></span>
              ))}
            </p>
            {isToday && streak && <p className="mt-1 text-xs text-neutral-500">{streakText(streak)}{streak.readToday ? ' · read today ✓' : ''}</p>}
          </header>
          {all.length === 0 && <p className="py-10 text-center text-neutral-500">Quiet day — nothing above your relevance threshold in the packs you follow.</p>}
          {top.length > 0 && <div className="divide-y divide-neutral-200 dark:divide-neutral-800">{top.map((s, i) => <TopStory key={s.key} story={s} n={i + 1} />)}</div>}
          {groups.some((g) => g.stories.length) && (
            <section className="mt-6 border-t border-neutral-400 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">More by topic</h2>
              <div className="mt-3 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {groups.filter((g) => g.stories.length).map((g) => (
                  <div key={g.key}>
                    <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: g.color, borderColor: g.color }}>{g.label} · {g.stories.length}</h3>
                    <ul>{g.stories.map((s) => <MoreItem key={s.key} story={s} />)}</ul>
                  </div>
                ))}
              </div>
            </section>
          )}
          {learn && <LearnSection learn={learn} />}
          {learn?.concept.quiz?.length ? <FinishLine quiz={learn.concept.quiz} concept={learn.concept.title} record={isToday && shown ? (b) => store.recordRead(shown, b) : null} streak={streak} /> : null}
          {all.length > 0 && <p ref={end} className="mt-10 text-center text-sm italic text-neutral-500">That’s all. Go make something.</p>}
        </>
      )}
    </div>
  );
}
