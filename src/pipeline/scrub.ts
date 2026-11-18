import type { Category, Topic } from '../db/schema.js';

/** Scrub mode (Phase 8): one run of the pipeline that serves every user's filter. */
export interface ScrubOpts {
  /** Replaces config.profile in S4 and S7; '' scores general importance. */
  profile: string;
  /** Reddit feeds and comments are fetched only when true (forks only). */
  includeReddit: boolean;
}

export interface SelectOpts { threshold: number; perGroup: number; cap: number }

/** S6 targets in scrub mode: the top `perGroup` per category and per topic above `threshold`, capped; model stories always kept. */
export function selectForSummary(stories: { id: number; score: number | null; category: Category | null; topic: Topic | null }[], { threshold, perGroup, cap }: SelectOpts): number[] {
  const byRank = (a: { id: number; score: number | null }, b: { id: number; score: number | null }) => (b.score ?? 0) - (a.score ?? 0) || a.id - b.id;
  const eligible = stories.filter((s) => s.score !== null && s.score >= threshold).sort(byRank);
  const picked = new Set<number>();
  for (const key of ['category', 'topic'] as const) {
    const taken = new Map<string, number>();
    for (const s of eligible) {
      const group = s[key] ?? 'none';
      const n = taken.get(group) ?? 0;
      if (n < perGroup) { picked.add(s.id); taken.set(group, n + 1); }
    }
  }
  const models = eligible.filter((s) => s.category === 'model').map((s) => s.id);
  const others = eligible.filter((s) => picked.has(s.id) && s.category !== 'model').map((s) => s.id);
  return [...models, ...others.slice(0, Math.max(0, cap - models.length))];
}
