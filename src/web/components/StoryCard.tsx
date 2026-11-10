import { useState } from 'react';
import { api, jsonBody, type StoryT } from '../api';
import { TOPIC_LABEL, topicColor } from '../topics';
import { FavoriteButton } from './FavoriteButton';

const ext = { target: '_blank', rel: 'noreferrer' } as const;
const quiet = 'hover:text-neutral-900 dark:hover:text-neutral-100';

/** Save · Discuss · Listen · Less like this, shared by every story layout. */
export function Actions({ story, onFavoriteChange }: { story: StoryT; onFavoriteChange?: (f: StoryT['favorite']) => void }) {
  const [favorite, setFavorite] = useState(story.favorite);
  const [noted, setNoted] = useState(false);
  const discussion = story.links.find((l) => l.discussionUrl)?.discussionUrl;
  const media = story.links.find((l) => l.mediaUrl)?.mediaUrl;
  return (
    <div className="mt-2 flex items-start gap-4 text-xs text-neutral-500">
      <FavoriteButton storyId={story.id} favorite={favorite} onChange={(f) => { setFavorite(f); onFavoriteChange?.(f); }} />
      {discussion && <a href={discussion} {...ext} className={quiet}>Discuss</a>}
      {media && <a href={media} {...ext} className={quiet}>Listen</a>}
      {noted ? (
        <span>Noted, you’ll see less like this</span>
      ) : (
        <button className={quiet} onClick={async () => { await api.feedback.$post({}, jsonBody({ storyId: story.id, kind: 'less_like_this' })); setNoted(true); }}>Less like this</button>
      )}
    </div>
  );
}

/** Vendor stats and pros/cons for model stories. */
export function ModelDetails({ story }: { story: StoryT }) {
  if (story.category !== 'model') return null;
  return (
    <>
      {story.stats && story.stats.length > 0 && (
        <table className="mt-3 text-sm">
          <caption className="pb-0.5 text-left text-xs text-neutral-500">Vendor-reported</caption>
          <tbody>
            {story.stats.map((s, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-6 text-neutral-500">{s.label}</td>
                <td className="py-0.5 tabular-nums"><a href={s.sourceUrl} {...ext} className="hover:underline">{s.value}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {story.pros?.length || story.cons?.length ? (
        <div className="mt-3 grid gap-4 text-sm text-neutral-600 sm:grid-cols-2 dark:text-neutral-300">
          {[['Pros', story.pros], ['Cons', story.cons]].map(([label, items]) => (items as string[] | undefined)?.length ? (
            <div key={label as string}>
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label as string}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{(items as string[]).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ) : null)}
        </div>
      ) : null}
    </>
  );
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** A story outside the front page (search hits, favorites), in the same calm style. */
export function StoryCard({ story, date, onFavoriteChange }: { story: StoryT; date?: string; onFavoriteChange?: (f: StoryT['favorite']) => void }) {
  const link = story.links[0];
  const color = topicColor(story.topic);
  return (
    <article className="border-b border-neutral-200 py-5 last:border-0 dark:border-neutral-800">
      <div className="flex flex-wrap gap-x-2 text-xs text-neutral-500">
        {date && <><a href={`#/d/${date}`} className={quiet}>{dayLabel(date)}</a><span>·</span></>}
        {story.topic !== 'other' && <><span className="font-semibold" style={{ color }}>{TOPIC_LABEL[story.topic]}</span><span>·</span></>}
        {link && <span>{link.sourceTitle}{story.links.length > 1 ? ` +${story.links.length - 1}` : ''}</span>}
        <span>·</span>
        <span>{story.readMinutes} min</span>
      </div>
      <h3 className="mt-1 text-lg font-semibold leading-snug">
        {link ? <a href={link.url} {...ext} className="hover:underline">{story.title}</a> : story.title}
      </h3>
      {story.summary && <p className="mt-1.5 text-neutral-600 dark:text-neutral-300">{story.summary}</p>}
      <ModelDetails story={story} />
      {story.favorite && story.favorite.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {story.favorite.tags.map((t) => <span key={t} className="rounded-full bg-neutral-200/70 px-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{t}</span>)}
        </div>
      )}
      <Actions story={story} onFavoriteChange={onFavoriteChange} />
    </article>
  );
}
