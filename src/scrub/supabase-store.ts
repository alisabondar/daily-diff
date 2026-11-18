import { createClient } from '@supabase/supabase-js';
import type { PublishedScrub } from './publish-shape.js';
import type { CatalogSource, LastPublished, ScrubStore } from './store.js';

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`Supabase ${what}: ${r.error.message}`);
  return r.data;
};

/** The real ScrubStore. Uses the service-role (secret) key, so it only ever runs in the scrub job or a CLI. */
export function createSupabaseScrubStore(url: string, serviceKey: string): ScrubStore {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async lastPublished(beforeDate: string): Promise<LastPublished | null> {
      const row = check(await db.from('scrubs').select('date, window_end').lt('date', beforeDate).order('date', { ascending: false }).limit(1).maybeSingle(), 'read last scrub');
      return row ? { date: row.date as string, windowEnd: Number(row.window_end) } : null;
    },
    async upsertScrub(s: PublishedScrub): Promise<void> {
      check(await db.from('scrubs').upsert({ date: s.date, window_start: s.windowStart, window_end: s.windowEnd, published_at: new Date().toISOString() }), 'upsert scrub');
      if (s.stories.length > 0) {
        check(await db.from('scrub_stories').upsert(s.stories.map((x) => ({
          key: x.key, date: x.date, title: x.title, links: x.links, source_keys: x.sourceKeys, pack: x.pack, category: x.category, topic: x.topic,
          score: x.score, summary: x.summary, stats: x.stats, pros: x.pros, cons: x.cons, read_minutes: x.readMinutes, published_at: x.publishedAt,
        })), { onConflict: 'key' }), 'upsert stories');
      }
      check(await db.from('scrub_learn').delete().eq('date', s.date), 'clear learn');
      if (s.learn.length > 0) {
        check(await db.from('scrub_learn').insert(s.learn.map((l) => ({
          date: s.date, position: l.position, type: l.type, concept_key: l.conceptKey, title: l.title, body_md: l.bodyMd, quiz: l.quiz,
          related_story_key: l.relatedStoryKey, source_ref: l.sourceRef,
        }))), 'insert learn');
      }
    },
    async upsertCatalog(rows: CatalogSource[]): Promise<void> {
      check(await db.from('catalog_sources').upsert(rows, { onConflict: 'key' }), 'upsert catalog');
      // Sources removed from the packs leave the catalog.
      const keep = rows.map((r) => `"${r.key}"`).join(',');
      check(await db.from('catalog_sources').delete().not('key', 'in', `(${keep})`), 'prune catalog');
    },
  };
}
