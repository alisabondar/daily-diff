import { useEffect, useState } from 'react';
import { api, jsonBody, type Digest, type Status, type StoryT } from '../api';
import { Banner } from '../components/Banner';
import { FavoriteButton } from '../components/FavoriteButton';
import { LearnSection } from '../components/LearnSection';
import { ProgressStrip } from '../components/ProgressStrip';
import { TOPIC_LABEL, TOPIC_ORDER, topicColor } from '../topics';

// "Calm" front page (from /fmk, design G): numbered top 3 with margin notes, then everything else by topic.
const MORE_LABEL: Record<string, string> = { 'long-reads': 'Long reads', podcasts: 'Podcasts', videos: 'Videos', other: 'Other' };

function Actions({ story }: { story: StoryT }) {
  const [favorite, setFavorite] = useState(story.favorite);
  const [noted, setNoted] = useState(false);
  const discussion = story.links.find((l) => l.discussionUrl)?.discussionUrl;
  return (
    <div className="mt-2 flex items-start gap-4 text-xs text-neutral-500">
      <FavoriteButton storyId={story.id} favorite={favorite} onChange={setFavorite} />
      {discussion && <a href={discussion} target="_blank" rel="noreferrer" className="hover:text-neutral-900 dark:hover:text-neutral-100">💬 Discuss</a>}
      {noted ? <span>Thanks — noted</span> : <button onClick={async () => { await api.feedback.$post({}, jsonBody({ storyId: story.id, kind: 'less_like_this' })); setNoted(true); }}>Less like this</button>}
    </div>
  );
}

function TopStory({ story, n }: { story: StoryT; n: number }) {
  const color = topicColor(story.topic);
  const link = story.links[0];
  return (
    <article className="grid grid-cols-[5.5rem_1fr] gap-5 py-5">
      <div className="border-r border-neutral-400/50 pr-4 text-right text-xs leading-relaxed text-neutral-500">
        <div className="text-3xl font-bold leading-none" style={{ color }}>{n}</div>
        <div className="mt-1 font-semibold" style={{ color }}>{TOPIC_LABEL[story.topic] ?? 'Other'}</div>
        <div>{story.readMinutes} min</div>
        {link && <div className="truncate">{link.sourceTitle}{story.links.length > 1 ? ` +${story.links.length - 1}` : ''}</div>}
      </div>
      <div>
        <h2 className="text-xl font-semibold leading-snug">
          {link ? <a href={link.url} target="_blank" rel="noreferrer" className="hover:underline">{story.title}</a> : story.title}
        </h2>
        {story.summary && <p className="mt-1.5 text-neutral-600 dark:text-neutral-300">{story.summary}</p>}
        {story.category === 'model' && story.stats && story.stats.length > 0 && (
          <table className="mt-2 text-sm">
            <caption className="text-left text-xs text-neutral-500">vendor-reported</caption>
            <tbody>{story.stats.map((s, i) => <tr key={i}><td className="pr-4 text-neutral-500">{s.label}</td><td><a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.value}</a></td></tr>)}</tbody>
          </table>
        )}
        {story.category === 'model' && (story.pros?.length || story.cons?.length) ? (
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-neutral-600 dark:text-neutral-300">
            <ul className="list-disc pl-5">{story.pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <ul className="list-disc pl-5">{story.cons?.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        ) : null}
        <Actions story={story} />
      </div>
    </article>
  );
}

function MoreItem({ story }: { story: StoryT }) {
  const [favorite, setFavorite] = useState(story.favorite);
  const link = story.links[0];
  return (
    <li className="py-1.5">
      {link ? <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:underline">{story.title}</a> : <span className="font-semibold">{story.title}</span>}
      <div className="flex gap-3 text-xs text-neutral-500">
        <span>{link?.sourceTitle} · {story.readMinutes} min</span>
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
  const minutes = all.reduce((a, s) => a + s.readMinutes, 0);
  const day = shown ? new Date(`${shown}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase() : '';

  return (
    <div>
      {!date && status.progress.running && <ProgressStrip message={status.progress.message} />}
      {digest && <Banner isRaw={digest.meta.isRaw} errorCode={digest.meta.errorCode} failedSources={date ? [] : status.failedSources} />}
      {!shown && !status.progress.running && <p className="text-neutral-500">No digest yet.</p>}
      {missing && <p className="text-neutral-500">No digest for {shown}.</p>}
      {digest && (
        <>
          <header className="border-b border-neutral-400 pb-3 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">The Daily Diff</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {digest.meta.isRaw ? 'today’s raw feed' : 'a calm morning read'} · {day} · {all.length} stories · {minutes} min
            </p>
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
          {all.length > 0 && <p className="mt-10 text-center text-sm italic text-neutral-500">That’s all. Go make something.</p>}
        </>
      )}
    </div>
  );
}
