import { useState } from 'react';
import type { Digest, ReadBody, Streak } from '../api';

type Question = NonNullable<NonNullable<Digest['learn']>['concept']['quiz']>[number];

export const streakText = (s: Streak) => (s.current > 0 ? `🔥 ${s.current}-day streak` : 'Start a streak today');

/** "Close the diff": the day's quiz, one question at a time, ending in a score line (step 26). */
export function FinishLine({ quiz, concept, record, streak }: { quiz: Question[]; concept: string; record: ((b: ReadBody) => void) | null; streak: Streak | null }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const done = i >= quiz.length;
  const q = quiz[i];

  const pick = (c: number) => {
    setPicked(c);
    if (c === q!.answerIndex) setCorrect((n) => n + 1);
  };
  const next = () => {
    const last = i + 1 >= quiz.length;
    if (last) record?.({ kind: 'quiz', correct, total: quiz.length });
    setI(i + 1);
    setPicked(null);
  };

  return (
    <section id="sec-finish" className="mt-10 rounded-xl border border-neutral-400 px-5 py-4 dark:border-neutral-600">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Close the diff</h2>
        <span className="text-xs text-neutral-500">{done ? `${quiz.length}/${quiz.length}` : `${i + 1}/${quiz.length}`} · {concept}</span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {quiz.map((_, k) => <span key={k} className={`h-1 flex-1 rounded ${k < i || done ? 'bg-neutral-700 dark:bg-neutral-300' : 'bg-neutral-200 dark:bg-neutral-800'}`} />)}
      </div>
      {done ? (
        <p className="mt-4 text-lg">
          <span className="font-semibold">{correct}/{quiz.length} correct</span>
          {streak && record && <span className="text-neutral-600 dark:text-neutral-300"> · {streakText(streak)}</span>}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="font-medium">{q!.q}</p>
          <div className="flex flex-col gap-1">
            {q!.choices.map((c, k) => (
              <button
                key={k}
                onClick={() => pick(k)}
                disabled={picked !== null}
                className={`rounded border px-3 py-1 text-left transition-colors ${picked === null ? 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800' : k === q!.answerIndex ? 'border-green-600 bg-green-50 dark:bg-green-950/40' : k === picked ? 'border-red-600 bg-red-50 dark:bg-red-950/40' : 'border-neutral-300 opacity-60 dark:border-neutral-700'}`}
              >
                {c}
              </button>
            ))}
          </div>
          {picked !== null && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{picked === q!.answerIndex ? '✓ Correct' : `Not quite. The answer is: ${q!.choices[q!.answerIndex]}`}</span>
              <button onClick={next} className="rounded bg-neutral-900 px-3 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900">{i + 1 < quiz.length ? 'Next' : 'Finish'}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
