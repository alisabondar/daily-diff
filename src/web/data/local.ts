import { z } from 'zod';
import { TOPICS, type Topic } from '../../shared/enums.js';

export interface LocalFavorite { key: string; createdAt: number; tags: string[] }
/** topic and sourceKey are copied from the story so the down-rank still applies on later days. */
export interface LocalFeedback { key: string; kind: 'less_like_this'; createdAt: number; topic: Topic; sourceKey: string | null }
export interface LocalRead { date: string; finishedAt: number | null; quizCorrect: number | null; quizTotal: number | null }

/** Everything a viewer's copy of the app knows about them. Lives in localStorage; synced to Supabase once signed in. */
export interface LocalState {
  onboarded: boolean;
  packs: string[];
  disabledSources: string[];
  topics: Topic[];
  keywords: string[];
  highlightsCap: number;
  relevanceThreshold: number;
  /** ms epoch of the last settings change (not favorites/feedback/reads), for sync. */
  updatedAt: number;
  favorites: LocalFavorite[];
  feedback: LocalFeedback[];
  reads: LocalRead[];
}

export const STORAGE_KEY = 'daily-diff:v2';

export const DEFAULT_STATE: LocalState = {
  onboarded: false, packs: [], disabledSources: [], topics: [], keywords: [], highlightsCap: 6, relevanceThreshold: 5,
  updatedAt: 0, favorites: [], feedback: [], reads: [],
};

/** Reads the state; a missing, corrupt or unreadable value gives the defaults. */
const D = () => DEFAULT_STATE;
const Schema = z.object({
  onboarded: z.boolean().default(D().onboarded),
  packs: z.array(z.string()).default([]),
  disabledSources: z.array(z.string()).default([]),
  topics: z.array(z.enum(TOPICS)).default([]),
  keywords: z.array(z.string()).default([]),
  highlightsCap: z.number().int().min(4).max(20).default(D().highlightsCap),
  relevanceThreshold: z.number().int().min(0).max(10).default(D().relevanceThreshold),
  updatedAt: z.number().default(0),
  favorites: z.array(z.object({ key: z.string(), createdAt: z.number(), tags: z.array(z.string()) })).default([]),
  feedback: z.array(z.object({ key: z.string(), kind: z.literal('less_like_this'), createdAt: z.number(), topic: z.enum(TOPICS), sourceKey: z.string().nullable() })).default([]),
  reads: z.array(z.object({ date: z.string(), finishedAt: z.number().nullable(), quizCorrect: z.number().nullable(), quizTotal: z.number().nullable() })).default([]),
});

export function loadLocal(storage: Pick<Storage, 'getItem'> | null): LocalState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = Schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : structuredClone(DEFAULT_STATE);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

/** Writes the state; storage errors are ignored (the in-memory state still works for this visit). */
export function saveLocal(storage: Pick<Storage, 'setItem'> | null, state: LocalState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode, quota or blocked storage: keep going with the in-memory state
  }
}
