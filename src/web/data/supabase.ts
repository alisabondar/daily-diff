import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublishedLearn, PublishedScrub, PublishedStory } from '../../shared/published.js';
import type { DayReader } from './days.js';
import { PUBLIC_ENV } from './public-env.js';

export interface CatalogRow { key: string; pack: string; title: string; url: string; type: string; kind: string }

/** The browser's Supabase client: the project URL and the publishable key only (row-level security protects data). */
export function createBrowserClient(): SupabaseClient {
  // PKCE returns ?code= in the query string, which leaves the hash router alone.
  return createClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.publishableKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
}

type StoryRow = {
  key: string; date: string; title: string; links: PublishedStory['links']; source_keys: string[]; pack: string | null; category: PublishedStory['category'];
  topic: PublishedStory['topic']; score: number; summary: string | null; stats: PublishedStory['stats']; pros: string[] | null; cons: string[] | null;
  read_minutes: number; published_at: number;
};
const STORY_COLS = 'key, date, title, links, source_keys, pack, category, topic, score, summary, stats, pros, cons, read_minutes, published_at';

const toStory = (r: StoryRow): PublishedStory => ({
  key: r.key, date: r.date, title: r.title, links: r.links, sourceKeys: r.source_keys, pack: r.pack, category: r.category, topic: r.topic, score: r.score,
  summary: r.summary, stats: r.stats, pros: r.pros, cons: r.cons, readMinutes: r.read_minutes, publishedAt: Number(r.published_at),
});

const ok = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export interface Reader extends DayReader {
  dates(): Promise<string[]>;
  search(q: string): Promise<PublishedStory[]>;
  catalog(): Promise<CatalogRow[]>;
  storiesByKeys(keys: string[]): Promise<PublishedStory[]>;
}

export function createReader(db: SupabaseClient): Reader {
  return {
    async day(date: string): Promise<PublishedScrub | null> {
      const head = ok(await db.from('scrubs').select('date, window_start, window_end').eq('date', date).maybeSingle()) as { window_start: number; window_end: number } | null;
      if (!head) return null;
      const stories = ok(await db.from('scrub_stories').select(STORY_COLS).eq('date', date).order('score', { ascending: false })) as StoryRow[];
      const learn = ok(await db.from('scrub_learn').select('*').eq('date', date).order('position')) as Record<string, unknown>[];
      return {
        date, windowStart: Number(head.window_start), windowEnd: Number(head.window_end), stories: stories.map(toStory),
        learn: learn.map((l): PublishedLearn => ({
          position: l.position as number, type: l.type as PublishedLearn['type'], conceptKey: l.concept_key as string | null, title: l.title as string,
          bodyMd: l.body_md as string, quiz: l.quiz as PublishedLearn['quiz'], relatedStoryKey: l.related_story_key as string | null, sourceRef: l.source_ref as string,
        })),
      };
    },
    async dates() {
      return (ok(await db.from('scrubs').select('date').order('date', { ascending: false })) as { date: string }[]).map((r) => r.date);
    },
    async search(q: string) {
      const rows = ok(await db.from('scrub_stories').select(STORY_COLS).textSearch('fts', q, { type: 'websearch', config: 'english' }).order('date', { ascending: false }).limit(50));
      return (rows as StoryRow[]).map(toStory);
    },
    async catalog() {
      return ok(await db.from('catalog_sources').select('key, pack, title, url, type, kind').order('pack').order('title')) as CatalogRow[];
    },
    async storiesByKeys(keys: string[]) {
      if (keys.length === 0) return [];
      return (ok(await db.from('scrub_stories').select(STORY_COLS).in('key', keys)) as StoryRow[]).map(toStory);
    },
  };
}
