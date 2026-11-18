import { useState } from 'react';
import { TOPICS, type Topic } from '../../shared/enums.js';
import { TOPIC_LABEL } from '../topics';

export const field = 'w-full rounded border border-neutral-300 bg-neutral-50 px-3 py-2 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';
export const primary = 'rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900' : 'border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300'}`;

/** Topic chips: stories on these topics rank higher. */
export function TopicPicker({ value, onChange }: { value: Topic[]; onChange: (t: Topic[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOPICS.filter((t) => t !== 'other').map((t) => {
        const on = value.includes(t);
        return <button key={t} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])} className={chip(on)}>{TOPIC_LABEL[t]}</button>;
      })}
    </div>
  );
}

/** Keywords: a story mentioning any of these in its title or summary ranks a little higher. */
export function KeywordInput({ value, onChange }: { value: string[]; onChange: (k: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const words = input.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length) onChange([...new Set([...value, ...words])]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((k) => <button key={k} type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`Remove keyword ${k}`} className="rounded-full bg-neutral-200 px-2 text-xs hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700">{k} ×</button>)}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder="e.g. rust, postgres, evals (Enter to add)" className={field} />
    </div>
  );
}
