import { useState } from 'react';
import { api, jsonBody, type StoryT } from '../api';
import { FavoriteButton } from './FavoriteButton';

export function StoryCard({ story, onFavoriteChange }: { story: StoryT; onFavoriteChange?: (f: StoryT['favorite']) => void }) {
  const [favorite, setFavorite] = useState(story.favorite);
  const [noted, setNoted] = useState(false);
  const isModel = story.category === 'model';

  const lessLikeThis = async () => {
    await api.feedback.$post({}, jsonBody({ storyId: story.id, kind: 'less_like_this' }));
    setNoted(true);
  };

  return (
    <article className="space-y-3 border-b border-neutral-200 py-5 dark:border-neutral-800">
      <h3 className="text-lg font-semibold">
        {story.links[0] ? <a href={story.links[0].url} target="_blank" rel="noreferrer" className="hover:underline">{story.title}</a> : story.title}
      </h3>
      {story.summary && <p>{story.summary}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {story.links.map((l, i) => (
          <span key={i} className="flex gap-1 rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
            <a href={l.url} target="_blank" rel="noreferrer">{l.sourceTitle}</a>
            {l.discussionUrl && <a href={l.discussionUrl} target="_blank" rel="noreferrer" title="Discussion">💬</a>}
            {l.mediaUrl && <a href={l.mediaUrl} target="_blank" rel="noreferrer" title="Listen">🎧</a>}
          </span>
        ))}
      </div>
      {isModel && story.stats && story.stats.length > 0 && (
        <table className="text-sm">
          <caption className="text-left text-xs text-neutral-500">vendor-reported</caption>
          <tbody>
            {story.stats.map((s, i) => (
              <tr key={i}>
                <td className="pr-4 text-neutral-500">{s.label}</td>
                <td><a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.value}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isModel && (story.pros?.length || story.cons?.length) ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ul className="list-disc pl-5">{story.pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <ul className="list-disc pl-5">{story.cons?.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}
      <div className="flex items-start gap-4 text-sm text-neutral-500">
        <FavoriteButton storyId={story.id} favorite={favorite} onChange={(f) => { setFavorite(f); onFavoriteChange?.(f); }} />
        {noted ? <span>Thanks — noted</span> : <button onClick={lessLikeThis}>Less like this</button>}
      </div>
    </article>
  );
}
