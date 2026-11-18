import type { LocalState } from './local.js';

/** A signed-in user's rows in Supabase, as one LocalState. The real one is src/web/data/supabase-user.ts. */
export interface UserStore {
  load(): Promise<LocalState | null>;
  save(state: LocalState): Promise<void>;
}

/**
 * First sign-in on a device: settings from whichever side changed last (ties go to remote); favorites, tags,
 * feedback and reading days are unioned. Remote null means a brand-new account, so local becomes remote.
 */
export function mergeLocalIntoRemote(local: LocalState, remote: LocalState | null): LocalState {
  if (!remote) return local;
  const s = local.updatedAt > remote.updatedAt ? local : remote;

  const favorites = new Map<string, LocalState['favorites'][number]>();
  for (const f of [...local.favorites, ...remote.favorites]) {
    const prev = favorites.get(f.key);
    favorites.set(f.key, prev ? { key: f.key, createdAt: Math.min(prev.createdAt, f.createdAt), tags: [...new Set([...prev.tags, ...f.tags])] } : { ...f, tags: [...f.tags] });
  }
  const feedback = new Map<string, LocalState['feedback'][number]>();
  for (const f of [...local.feedback, ...remote.feedback]) {
    const id = `${f.key}|${f.kind}`;
    const prev = feedback.get(id);
    feedback.set(id, prev && prev.createdAt <= f.createdAt ? prev : f);
  }
  const reads = new Map<string, LocalState['reads'][number]>();
  for (const r of [...local.reads, ...remote.reads]) {
    const prev = reads.get(r.date);
    if (!prev) { reads.set(r.date, { ...r }); continue; }
    const finished = [prev.finishedAt, r.finishedAt].filter((x): x is number => x !== null);
    const quiz = prev.quizTotal !== null ? prev : r;
    reads.set(r.date, { date: r.date, finishedAt: finished.length ? Math.min(...finished) : null, quizCorrect: quiz.quizCorrect, quizTotal: quiz.quizTotal });
  }
  return {
    onboarded: s.onboarded || local.onboarded || remote.onboarded,
    packs: s.packs, disabledSources: s.disabledSources, topics: s.topics, keywords: s.keywords,
    highlightsCap: s.highlightsCap, relevanceThreshold: s.relevanceThreshold, updatedAt: s.updatedAt,
    favorites: [...favorites.values()], feedback: [...feedback.values()], reads: [...reads.values()],
  };
}

/**
 * After sign-in. The first time on this device (`firstOnDevice`) local and remote are merged and saved;
 * after that Supabase is the source of truth, so the remote state replaces the local copy.
 */
export async function syncOnSignIn(local: LocalState, store: UserStore, firstOnDevice: boolean): Promise<LocalState> {
  const remote = await store.load();
  if (remote && !firstOnDevice) return remote;
  const merged = mergeLocalIntoRemote(local, remote);
  await store.save(merged);
  return merged;
}
