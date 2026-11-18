import { expect, test } from 'vitest';
import { DEFAULT_STATE, type LocalState } from '../src/web/data/local.js';
import { mergeLocalIntoRemote, syncOnSignIn, type UserStore } from '../src/web/data/sync.js';

const st = (over: Partial<LocalState> = {}): LocalState => ({ ...structuredClone(DEFAULT_STATE), ...over });
const fav = (key: string, createdAt: number, tags: string[] = []) => ({ key, createdAt, tags });
const fb = (key: string, createdAt = 1) => ({ key, kind: 'less_like_this' as const, createdAt, topic: 'ai' as const, sourceKey: null });
const read = (date: string, over: Partial<LocalState['reads'][number]> = {}) => ({ date, finishedAt: null, quizCorrect: null, quizTotal: null, ...over });

test('no remote row: local becomes remote', () => {
  const local = st({ onboarded: true, topics: ['ai'], favorites: [fav('a', 1)] });
  expect(mergeLocalIntoRemote(local, null)).toEqual(local);
});

test('settings come from the side with the newer updatedAt; ties go to remote', () => {
  const local = st({ onboarded: true, topics: ['ai'], packs: ['eng'], updatedAt: 200 });
  const remote = st({ onboarded: true, topics: ['security'], packs: ['tools'], highlightsCap: 9, updatedAt: 100 });
  expect(mergeLocalIntoRemote(local, remote)).toMatchObject({ topics: ['ai'], packs: ['eng'], highlightsCap: 6, updatedAt: 200 });
  expect(mergeLocalIntoRemote({ ...local, updatedAt: 50 }, remote)).toMatchObject({ topics: ['security'], packs: ['tools'], highlightsCap: 9, updatedAt: 100 });
  expect(mergeLocalIntoRemote({ ...local, updatedAt: 100 }, remote)).toMatchObject({ topics: ['security'] });
});

test('a new device (not onboarded, updatedAt 0) takes the remote settings and becomes onboarded', () => {
  const remote = st({ onboarded: true, topics: ['infra'], updatedAt: 5 });
  expect(mergeLocalIntoRemote(st(), remote)).toMatchObject({ onboarded: true, topics: ['infra'] });
});

test('favorites are unioned by key, tags unioned, earliest createdAt kept', () => {
  const local = st({ favorites: [fav('a', 5, ['x']), fav('b', 2)] });
  const remote = st({ favorites: [fav('a', 3, ['y', 'x']), fav('c', 1)] });
  const out = mergeLocalIntoRemote(local, remote).favorites.sort((p, q) => p.key.localeCompare(q.key));
  expect(out).toEqual([fav('a', 3, ['x', 'y']), fav('b', 2), fav('c', 1)]);
});

test('feedback is unioned by story key and kind', () => {
  const out = mergeLocalIntoRemote(st({ feedback: [fb('a', 5), fb('b')] }), st({ feedback: [fb('a', 3), fb('c')] })).feedback;
  expect(out.map((f) => f.key).sort()).toEqual(['a', 'b', 'c']);
  expect(out.find((f) => f.key === 'a')!.createdAt).toBe(3);
});

test('reading days are unioned by date; the earliest finish and any quiz result are kept', () => {
  const local = st({ reads: [read('2026-11-17', { finishedAt: 9 }), read('2026-11-18', { quizCorrect: 2, quizTotal: 3 })] });
  const remote = st({ reads: [read('2026-11-17', { finishedAt: 4 }), read('2026-11-16', { finishedAt: 1 })] });
  const out = mergeLocalIntoRemote(local, remote).reads.sort((a, b) => a.date.localeCompare(b.date));
  expect(out).toEqual([read('2026-11-16', { finishedAt: 1 }), read('2026-11-17', { finishedAt: 4 }), read('2026-11-18', { quizCorrect: 2, quizTotal: 3 })]);
});

test('merging twice changes nothing', () => {
  const local = st({ onboarded: true, updatedAt: 9, favorites: [fav('a', 1, ['t'])], feedback: [fb('b')], reads: [read('2026-11-18', { finishedAt: 1 })] });
  const remote = st({ onboarded: true, updatedAt: 3, favorites: [fav('c', 2)], reads: [read('2026-11-17', { finishedAt: 2 })] });
  const once = mergeLocalIntoRemote(local, remote);
  expect(mergeLocalIntoRemote(once, once)).toEqual(once);
});

function memStore(initial: LocalState | null) {
  const saved: LocalState[] = [];
  const store: UserStore = { async load() { return initial; }, async save(s) { saved.push(s); } };
  return { store, saved };
}

test('syncOnSignIn the first time on a device merges and saves the merge', async () => {
  const { store, saved } = memStore(st({ onboarded: true, favorites: [fav('r', 1)], updatedAt: 1 }));
  const out = await syncOnSignIn(st({ onboarded: true, favorites: [fav('l', 2)], updatedAt: 2 }), store, true);
  expect(out.favorites.map((f) => f.key).sort()).toEqual(['l', 'r']);
  expect(saved).toEqual([out]);
});

test('syncOnSignIn after the first time takes remote as the truth (a favorite removed elsewhere stays removed)', async () => {
  const { store, saved } = memStore(st({ onboarded: true, favorites: [], updatedAt: 5 }));
  const out = await syncOnSignIn(st({ onboarded: true, favorites: [fav('gone', 1)], updatedAt: 5 }), store, false);
  expect(out.favorites).toEqual([]);
  expect(saved).toEqual([]);
});

test('syncOnSignIn with no remote row saves local even when not first on device', async () => {
  const { store, saved } = memStore(null);
  const local = st({ onboarded: true, topics: ['ai'] });
  expect(await syncOnSignIn(local, store, false)).toEqual(local);
  expect(saved).toEqual([local]);
});
