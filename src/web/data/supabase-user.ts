import type { SupabaseClient } from '@supabase/supabase-js';
import type { Topic } from '../../shared/enums.js';
import type { LocalState } from './local.js';
import type { UserStore } from './sync.js';

const ok = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};
const ms = (iso: string) => Date.parse(iso);
const iso = (n: number) => new Date(n || Date.now()).toISOString();
/** PostgREST `in` list, quoted. */
const list = (xs: string[]) => `(${xs.map((x) => `"${x.replace(/"/g, '')}"`).join(',')})`;

/** The signed-in user's rows. Row-level security limits every query to this user; user_id is still set explicitly. */
export function createUserStore(db: SupabaseClient, userId: string): UserStore {
  return {
    async load() {
      const s = ok(await db.from('user_settings').select('*').eq('user_id', userId).maybeSingle()) as Record<string, unknown> | null;
      if (!s) return null;
      const favs = ok(await db.from('favorites').select('story_key, created_at').eq('user_id', userId)) as { story_key: string; created_at: string }[];
      const tags = ok(await db.from('favorite_tags').select('story_key, tag').eq('user_id', userId)) as { story_key: string; tag: string }[];
      const fb = ok(await db.from('feedback').select('story_key, kind, topic, source_key, created_at').eq('user_id', userId)) as { story_key: string; kind: 'less_like_this'; topic: Topic; source_key: string | null; created_at: string }[];
      const reads = ok(await db.from('reads').select('date, finished_at, quiz_correct, quiz_total').eq('user_id', userId)) as { date: string; finished_at: number | null; quiz_correct: number | null; quiz_total: number | null }[];
      return {
        onboarded: s.onboarded as boolean,
        packs: s.packs as string[],
        disabledSources: s.disabled_sources as string[],
        topics: s.topics as Topic[],
        keywords: s.keywords as string[],
        highlightsCap: s.highlights_cap as number,
        relevanceThreshold: s.relevance_threshold as number,
        updatedAt: ms(s.updated_at as string),
        favorites: favs.map((f) => ({ key: f.story_key, createdAt: ms(f.created_at), tags: tags.filter((t) => t.story_key === f.story_key).map((t) => t.tag) })),
        feedback: fb.map((f) => ({ key: f.story_key, kind: f.kind, createdAt: ms(f.created_at), topic: f.topic, sourceKey: f.source_key })),
        reads: reads.map((r) => ({ date: r.date, finishedAt: r.finished_at === null ? null : Number(r.finished_at), quizCorrect: r.quiz_correct, quizTotal: r.quiz_total })),
      };
    },

    async save(st: LocalState) {
      ok(await db.from('user_settings').upsert({
        user_id: userId, onboarded: st.onboarded, packs: st.packs, disabled_sources: st.disabledSources, topics: st.topics, keywords: st.keywords,
        highlights_cap: st.highlightsCap, relevance_threshold: st.relevanceThreshold, updated_at: iso(st.updatedAt),
      }));
      // Favorites and feedback mirror the local lists exactly (removals included); reads only grow.
      const favKeys = st.favorites.map((f) => f.key);
      const drop = db.from('favorites').delete().eq('user_id', userId);
      ok(await (favKeys.length ? drop.not('story_key', 'in', list(favKeys)) : drop));
      if (st.favorites.length) ok(await db.from('favorites').upsert(st.favorites.map((f) => ({ user_id: userId, story_key: f.key, created_at: iso(f.createdAt) }))));
      ok(await db.from('favorite_tags').delete().eq('user_id', userId));
      const tagRows = st.favorites.flatMap((f) => f.tags.map((tag) => ({ user_id: userId, story_key: f.key, tag })));
      if (tagRows.length) ok(await db.from('favorite_tags').insert(tagRows));
      const fbKeys = st.feedback.map((f) => f.key);
      const dropFb = db.from('feedback').delete().eq('user_id', userId);
      ok(await (fbKeys.length ? dropFb.not('story_key', 'in', list(fbKeys)) : dropFb));
      if (st.feedback.length) {
        ok(await db.from('feedback').upsert(st.feedback.map((f) => ({ user_id: userId, story_key: f.key, kind: f.kind, topic: f.topic, source_key: f.sourceKey, created_at: iso(f.createdAt) }))));
      }
      if (st.reads.length) {
        ok(await db.from('reads').upsert(st.reads.map((r) => ({ user_id: userId, date: r.date, finished_at: r.finishedAt, quiz_correct: r.quizCorrect, quiz_total: r.quizTotal }))));
      }
    },
  };
}
