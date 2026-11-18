import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishedStory } from '../../shared/published.js';
import { computeStreak, type Streak } from '../../streak.js';
import { cachedDays } from './days.js';
import { createGate } from './gate.js';
import { loadLocal, saveLocal, type LocalFavorite, type LocalState } from './local.js';
import { createBrowserClient, createReader, type Reader } from './supabase.js';

/** localStorage, or null where it's blocked (private mode, sandboxed previews). */
export function browserStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem('daily-diff:probe');
    return s;
  } catch {
    return null;
  }
}

export type ReadBody = { kind: 'finished' } | { kind: 'quiz'; correct: number; total: number };

export interface Store {
  state: LocalState;
  /** Applies a change and persists it. `settings: true` bumps updatedAt (used by sync to pick the newer settings). */
  update(fn: (s: LocalState) => LocalState, opts?: { settings?: boolean }): void;
  /** Null until onboarding is finished: nothing talks to the backend before that. */
  reader: Reader | null;
  /** The raw client, for auth (step 40). Null until onboarding is finished, unless sign-in was requested. */
  client: SupabaseClient | null;
  /** Creates the client for an explicit sign-in before onboarding (the gate's one exception). */
  clientForSignIn(): SupabaseClient;
  favorite(key: string): LocalFavorite | undefined;
  setFavorite(key: string, tags: string[] | null): void;
  lessLikeThis(story: PublishedStory): void;
  recordRead(date: string, body: ReadBody): void;
  streak(today: string): Streak;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Hooks a change listener into the store (step 40 uses it to sync). */
export type OnChange = (prev: LocalState, next: LocalState) => void;

export function StoreProvider({ children, onChange }: { children: ReactNode; onChange?: OnChange }) {
  const storage = useMemo(browserStorage, []);
  const [state, setState] = useState(() => loadLocal(storage));
  // Returning from GitHub sign-in (?code=…) counts as the explicit sign-in action, even before onboarding.
  const [signInRequested, setSignInRequested] = useState(() => new URLSearchParams(window.location.search).has('code'));
  const gate = useMemo(() => createGate(createBrowserClient), []);
  const client = gate.get(state, { forSignIn: signInRequested });
  const reader = useMemo(() => {
    if (!client || !state.onboarded) return null;
    const r = createReader(client);
    return { ...r, day: cachedDays(r, storage).day };
  }, [client, state.onboarded, storage]);

  const update = useCallback<Store['update']>((fn, opts) => {
    setState((prev) => {
      const changed = fn(prev);
      const next = opts?.settings ? { ...changed, updatedAt: Date.now() } : changed;
      saveLocal(storage, next);
      onChange?.(prev, next);
      return next;
    });
  }, [storage, onChange]);

  const store = useMemo<Store>(() => ({
    state,
    update,
    reader,
    client,
    clientForSignIn() {
      setSignInRequested(true);
      return gate.get(state, { forSignIn: true })!;
    },
    favorite: (key) => state.favorites.find((f) => f.key === key),
    setFavorite(key, tags) {
      update((s) => {
        const rest = s.favorites.filter((f) => f.key !== key);
        if (tags === null) return { ...s, favorites: rest };
        const prev = s.favorites.find((f) => f.key === key);
        return { ...s, favorites: [...rest, { key, createdAt: prev?.createdAt ?? Date.now(), tags }] };
      });
    },
    lessLikeThis(story) {
      update((s) => s.feedback.some((f) => f.key === story.key) ? s : {
        ...s, feedback: [...s.feedback, { key: story.key, kind: 'less_like_this', createdAt: Date.now(), topic: story.topic, sourceKey: story.sourceKeys[0] ?? null }],
      });
    },
    recordRead(date, body) {
      update((s) => {
        const prev = s.reads.find((r) => r.date === date) ?? { date, finishedAt: null, quizCorrect: null, quizTotal: null };
        const next = body.kind === 'finished' ? { ...prev, finishedAt: prev.finishedAt ?? Date.now() } : { ...prev, quizCorrect: body.correct, quizTotal: body.total };
        return { ...s, reads: [...s.reads.filter((r) => r.date !== date), next] };
      });
    },
    streak: (today) => computeStreak(state.reads.map((r) => r.date), today),
  }), [state, update, reader, client, gate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
