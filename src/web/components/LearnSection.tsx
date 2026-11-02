import { useState } from 'react';
import type { Digest } from '../api';
import { Markdown } from './Markdown.tsx';

type Learn = NonNullable<Digest['learn']>;
type Question = NonNullable<Learn['concept']['quiz']>[number];

function Quiz({ q }: { q: Question }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <p className="font-medium">{q.q}</p>
      <div className="flex flex-col gap-1">
        {q.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => setPicked(i)}
            disabled={picked !== null}
            className={`rounded border px-3 py-1 text-left ${picked === null ? 'border-neutral-300 dark:border-neutral-700' : i === q.answerIndex ? 'border-green-600' : i === picked ? 'border-red-600' : 'border-neutral-300 opacity-60 dark:border-neutral-700'}`}
          >
            {c}
          </button>
        ))}
      </div>
      {picked !== null && <p className="text-sm">{picked === q.answerIndex ? '✓ Correct' : `✗ The answer is: ${q.choices[q.answerIndex]}`}</p>}
    </div>
  );
}

const Ref = ({ value }: { value: string }) => (
  <p className="text-xs text-neutral-500">
    Source: {/^https:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer" className="underline">{value}</a> : value}
  </p>
);

export function LearnSection({ learn }: { learn: Learn }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">📚 Learn Something New</h2>
      <div className="space-y-4 rounded border border-neutral-200 p-5 dark:border-neutral-800">
        <h3 className="text-lg font-semibold">{learn.concept.title}</h3>
        <Markdown src={learn.concept.bodyMd} />
        <Ref value={learn.concept.sourceRef} />
        {learn.concept.quiz?.map((q, i) => <Quiz key={i} q={q} />)}
      </div>
      <div className="space-y-4 rounded border border-neutral-200 p-5 dark:border-neutral-800">
        <h3 className="text-lg font-semibold">{learn.quickstart.title}</h3>
        <Markdown src={learn.quickstart.bodyMd} />
        <Ref value={learn.quickstart.sourceRef} />
      </div>
    </section>
  );
}
