import { expect, test } from 'vitest';
import type { PublishedScrub } from '../src/shared/published.js';
import { DAY_CACHE_MAX, DAY_CACHE_PREFIX, cachedDays, type DayReader } from '../src/web/data/days.js';
import { createGate } from '../src/web/data/gate.js';
import { DEFAULT_STATE, STORAGE_KEY, loadLocal, saveLocal, type LocalState } from '../src/web/data/local.js';

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } as unknown as Storage;

// ---------- gate ----------

test('before onboarding the gate returns null and never calls the factory', () => {
  let calls = 0;
  const gate = createGate(() => { calls++; return { client: true }; });
  expect(gate.get({ onboarded: false })).toBeNull();
  expect(gate.get({ onboarded: false })).toBeNull();
  expect(calls).toBe(0);
});

test('after onboarding the factory is called once across repeated gets', () => {
  let calls = 0;
  const gate = createGate(() => { calls++; return { client: calls }; });
  const a = gate.get({ onboarded: true });
  const b = gate.get({ onboarded: true });
  expect(a).toEqual({ client: 1 });
  expect(b).toBe(a);
  expect(calls).toBe(1);
});

test('forSignIn creates the client before onboarding', () => {
  let calls = 0;
  const gate = createGate(() => { calls++; return {}; });
  expect(gate.get({ onboarded: false }, { forSignIn: true })).not.toBeNull();
  expect(calls).toBe(1);
});

// ---------- local state ----------

test('loadLocal gives defaults for missing, corrupt, wrong-shaped or unreadable storage', () => {
  const s = new MemStorage();
  expect(loadLocal(s)).toEqual(DEFAULT_STATE);
  s.setItem(STORAGE_KEY, '{not json');
  expect(loadLocal(s)).toEqual(DEFAULT_STATE);
  s.setItem(STORAGE_KEY, JSON.stringify({ onboarded: 'yes', topics: ['not-a-topic'] }));
  expect(loadLocal(s)).toEqual(DEFAULT_STATE);
  expect(loadLocal(throwing)).toEqual(DEFAULT_STATE);
  expect(loadLocal(null)).toEqual(DEFAULT_STATE);
});

test('saveLocal then loadLocal round-trips; saving to throwing storage does not throw', () => {
  const s = new MemStorage();
  const state: LocalState = {
    ...DEFAULT_STATE, onboarded: true, packs: ['ai-news'], disabledSources: ['abc'], topics: ['ai', 'security'], keywords: ['rust'],
    highlightsCap: 8, relevanceThreshold: 4, updatedAt: 123,
    favorites: [{ key: 'k1', createdAt: 1, tags: ['t'] }],
    feedback: [{ key: 'k2', kind: 'less_like_this', createdAt: 2, topic: 'industry', sourceKey: 's1' }],
    reads: [{ date: '2026-11-18', finishedAt: 5, quizCorrect: null, quizTotal: null }],
  };
  saveLocal(s, state);
  expect(loadLocal(s)).toEqual(state);
  expect(() => saveLocal(throwing, state)).not.toThrow();
});

test('a saved state missing newer fields is filled from the defaults', () => {
  const s = new MemStorage();
  s.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true, packs: ['eng'] }));
  expect(loadLocal(s)).toEqual({ ...DEFAULT_STATE, onboarded: true, packs: ['eng'] });
});

// ---------- day cache ----------

const day = (date: string): PublishedScrub => ({ date, windowStart: 0, windowEnd: 1, stories: [], learn: [] });
function countingReader() {
  const calls: string[] = [];
  const reader: DayReader = { async day(date) { calls.push(date); return date === 'missing' ? null : day(date); } };
  return { reader, calls };
}

test('a day is fetched once, then served from the cache', async () => {
  const { reader, calls } = countingReader();
  const s = new MemStorage();
  const cached = cachedDays(reader, s);
  expect(await cached.day('2026-11-18')).toEqual(day('2026-11-18'));
  expect(await cached.day('2026-11-18')).toEqual(day('2026-11-18'));
  expect(calls).toEqual(['2026-11-18']);
  // a fresh wrapper over the same storage (a reload) still hits the cache
  expect(await cachedDays(reader, s).day('2026-11-18')).toEqual(day('2026-11-18'));
  expect(calls).toEqual(['2026-11-18']);
});

test('a missing day is not cached', async () => {
  const { reader, calls } = countingReader();
  const cached = cachedDays(reader, new MemStorage());
  expect(await cached.day('missing')).toBeNull();
  expect(await cached.day('missing')).toBeNull();
  expect(calls).toEqual(['missing', 'missing']);
});

test('the cache keeps the newest DAY_CACHE_MAX dates and evicts the oldest', async () => {
  const { reader } = countingReader();
  const s = new MemStorage();
  const cached = cachedDays(reader, s);
  const dates = Array.from({ length: DAY_CACHE_MAX + 1 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  for (const d of [...dates].reverse()) await cached.day(d); // fetch newest first, so eviction is by date, not by order
  const kept = [...s.m.keys()].filter((k) => k.startsWith(DAY_CACHE_PREFIX)).map((k) => k.slice(DAY_CACHE_PREFIX.length)).sort();
  expect(kept).toHaveLength(DAY_CACHE_MAX);
  expect(kept).not.toContain('2026-10-01');
});

test('the day cache still works when storage throws or is null', async () => {
  const { reader, calls } = countingReader();
  expect(await cachedDays(reader, throwing).day('2026-11-18')).toEqual(day('2026-11-18'));
  expect(await cachedDays(reader, null).day('2026-11-18')).toEqual(day('2026-11-18'));
  expect(calls).toHaveLength(2);
});
