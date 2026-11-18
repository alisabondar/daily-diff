import type { PublishedLearn } from '../../shared/published.js';
import { Markdown } from './Markdown.tsx';

export interface Learn { concept: PublishedLearn; quickstart: PublishedLearn | null }

/** The day's Learn items as the section shows them; null when there's no concept. */
export function learnOf(items: PublishedLearn[]): Learn | null {
  const concept = items.find((l) => l.type === 'concept');
  return concept ? { concept, quickstart: items.find((l) => l.type === 'quickstart') ?? null } : null;
}

const Ref = ({ value }: { value: string }) => (
  <p className="text-xs text-neutral-500">
    Source: {/^https:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer" className="underline">{value}</a> : value}
  </p>
);

export function LearnSection({ learn }: { learn: Learn }) {
  return (
    <details id="sec-learn" className="group mt-10 space-y-4 rounded-xl border border-dashed border-neutral-400 px-5 py-4 dark:border-neutral-600">
      <summary className="cursor-pointer list-none">
        <span className="flex items-baseline gap-2">
          <span className="inline-block text-neutral-500 transition-transform group-open:rotate-90">›</span>
          <span className="font-semibold">Learn something new</span>
          <span className="text-sm text-neutral-500">· {learn.concept.title}</span>
        </span>
      </summary>
      <div className="space-y-4 rounded-xl bg-neutral-50 p-5 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold">{learn.concept.title}</h3>
        <Markdown src={learn.concept.bodyMd} />
        <Ref value={learn.concept.sourceRef} />
        {learn.concept.quiz?.length ? <p className="text-sm"><a href="#sec-finish" onClick={(e) => { e.preventDefault(); document.getElementById('sec-finish')?.scrollIntoView({ behavior: 'smooth' }); }} className="underline">Test yourself in Close the diff ↓</a></p> : null}
      </div>
      {learn.quickstart && (
        <div className="space-y-4 rounded-xl bg-neutral-50 p-5 dark:bg-neutral-900">
          <h3 className="text-lg font-semibold">{learn.quickstart.title}</h3>
          <Markdown src={learn.quickstart.bodyMd} />
          <Ref value={learn.quickstart.sourceRef} />
        </div>
      )}
    </details>
  );
}
