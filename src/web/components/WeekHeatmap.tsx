import { useEffect, useState } from 'react';
import { api, type Digest } from '../api';
import { TOPIC_LABEL, TOPIC_ORDER, topicColor } from '../topics';

type Col = { date: string; counts: Record<string, number> };

/** Topics × the last 7 done digests, built client-side from existing endpoints (step 27). */
export function WeekHeatmap() {
  const [cols, setCols] = useState<Col[] | null>(null);
  useEffect(() => {
    (async () => {
      const days = await (await api.digests.$get({ query: { limit: '7' } })).json();
      const digests = await Promise.all(days.map(async (d) => (await api.digests[':date'].$get({ param: { date: d.date } })).json() as Promise<Digest>));
      setCols(
        digests.map((g, i) => {
          const counts: Record<string, number> = {};
          for (const s of [...g.highlights, ...g.more].flatMap((x) => x.stories)) counts[s.topic] = (counts[s.topic] ?? 0) + 1;
          return { date: days[i]!.date, counts };
        }).reverse(),
      );
    })();
  }, []);
  if (!cols?.length) return null;
  const max = Math.max(1, ...cols.flatMap((c) => Object.values(c.counts)));
  const topics = TOPIC_ORDER.filter((t) => cols.some((c) => c.counts[t]));
  const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

  return (
    <section aria-label="Recent days by topic">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent days</h2>
      <table className="mt-2 w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c.date} className="font-normal text-neutral-500"><a href={`#/d/${c.date}`} className="hover:underline">{short(c.date)}</a></th>)}
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t}>
              <th className="whitespace-nowrap pr-2 text-left font-normal text-neutral-500">{TOPIC_LABEL[t]}</th>
              {cols.map((c) => {
                const n = c.counts[t] ?? 0;
                return (
                  <td key={c.date} className="p-0">
                    <a href={`#/d/${c.date}`} title={`${TOPIC_LABEL[t]} · ${n} on ${c.date}`} className="block h-5 rounded-sm bg-neutral-200/60 dark:bg-neutral-800/60">
                      {n > 0 && <span className="block h-full rounded-sm" style={{ background: topicColor(t), opacity: 0.25 + 0.75 * (n / max) }} />}
                    </a>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
