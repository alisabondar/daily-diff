import type { PublishedScrub } from './publish-shape.js';

export interface CatalogSource { key: string; pack: string; title: string; url: string; type: string; kind: string }
export interface LastPublished { date: string; windowEnd: number }

/** Where scrubs are published. The real one is Supabase; tests use an in-memory fake. */
export interface ScrubStore {
  /** The latest published day strictly before `date` (so re-running today re-scrubs from yesterday's end). */
  lastPublished(beforeDate: string): Promise<LastPublished | null>;
  /** Upserts the day and its stories by key and replaces that day's learn items. Idempotent per date. */
  upsertScrub(scrub: PublishedScrub): Promise<void>;
  upsertCatalog(rows: CatalogSource[]): Promise<void>;
}
