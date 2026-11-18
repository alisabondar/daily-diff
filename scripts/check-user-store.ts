// Dev check for step 40: the real UserStore against the LOCAL Supabase stack, with two throwaway password users
// created through the admin API (local dev only; GitHub sign-in can't be automated).
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local secret> SUPABASE_PUBLISHABLE_KEY=<local publishable> node --import tsx scripts/check-user-store.ts
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_STATE } from '../src/web/data/local.js';
import { createUserStore } from '../src/web/data/supabase-user.js';
import { syncOnSignIn } from '../src/web/data/sync.js';

const url = process.env.SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!, pub = process.env.SUPABASE_PUBLISHABLE_KEY!;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('local stack only');
const admin = createClient(url, service, { auth: { persistSession: false } });
const assert = (c: unknown, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`ok - ${m}`); };

async function user() {
  const email = `t-${randomUUID()}@test.local`, password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, c };
}

const a = await user(), b = await user();
const storeA = createUserStore(a.c, a.id);
assert((await storeA.load()) === null, 'a new account has no rows');
const local = {
  ...DEFAULT_STATE, onboarded: true, packs: ['ai-news'], topics: ['ai' as const], keywords: ['rust'], updatedAt: Date.parse('2026-11-18T10:00:00Z'),
  favorites: [{ key: 'k1', createdAt: Date.parse('2026-11-18T10:01:00Z'), tags: ['dbs', 'later'] }],
  feedback: [{ key: 'k2', kind: 'less_like_this' as const, createdAt: Date.parse('2026-11-18T10:02:00Z'), topic: 'industry' as const, sourceKey: 's1' }],
  reads: [{ date: '2026-11-18', finishedAt: 123, quizCorrect: 2, quizTotal: 3 }],
};
const merged = await syncOnSignIn(local, storeA, true);
const loaded = await storeA.load();
assert(isDeepStrictEqual(loaded, merged), 'save then load round-trips the whole state');

await storeA.save({ ...merged, favorites: [], feedback: [] });
const after = await storeA.load();
assert(after!.favorites.length === 0 && after!.feedback.length === 0, 'removing a favorite and feedback removes the rows');
assert(after!.reads.length === 1, 'reading days are kept');

const storeBreadsA = createUserStore(b.c, a.id);
assert((await storeBreadsA.load()) === null, "user B cannot read user A's settings");
const { error: writeErr } = await b.c.from('favorites').insert({ user_id: a.id, story_key: 'x' });
assert(!!writeErr, "user B cannot write a favorite for user A");

const del = await a.c.rpc('delete_my_account');
assert(!del.error, 'delete_my_account succeeds');
const { count } = await admin.from('user_settings').select('*', { count: 'exact', head: true }).eq('user_id', a.id);
assert(count === 0, "deleting the account removes the user's rows");
await admin.auth.admin.deleteUser(b.id);
console.log('USER STORE OK');
