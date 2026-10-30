import { desc, eq } from 'drizzle-orm';
import { redactKey, type Config } from '../config.js';
import type { Db } from '../db/client.js';
import { digests } from '../db/schema.js';
import { LlmError, type Llm } from '../llm/types.js';
import { computeWindow, localDate } from '../time.js';
import type { StageCtx } from './context.js';
import { progress } from './progress.js';
import { buildRaw } from './raw.js';
import { runS1, type Digest } from './s1-fetch.js';
import { runS2, windowItems } from './s2-store.js';
import { runS3 } from './s3-group.js';
import { runS4 } from './s4-score.js';
import { runS5 } from './s5-enrich.js';
import { runS6 } from './s6-summarize.js';
import { runS7 } from './s7-compose.js';
import { runS8 } from './s8-save.js';

export interface EnsureDeps {
  db: Db;
  getConfig: () => Config;
  llmFactory: (c: Config) => Llm | null;
  fetchFn?: typeof fetch;
  now: () => Date;
  retryDelaysMs?: number[];
}
export interface EnsureResult { started: boolean; digestDate: string | null }

const LLM_STAGES: { stage: number; message: string | ((db: Db, d: Digest) => string); run: (ctx: StageCtx) => Promise<void> }[] = [
  { stage: 3, message: (db, d) => `Grouping ${windowItems(db, d).length} items into stories…`, run: runS3 },
  { stage: 4, message: 'Scoring stories…', run: runS4 },
  { stage: 5, message: 'Gathering community reactions…', run: runS5 },
  { stage: 6, message: 'Summarizing stories…', run: runS6 },
  { stage: 7, message: 'Writing Highlights and Learn…', run: runS7 },
];

let lock: { digestDate: string; done: Promise<void> } | null = null;

export function __resetLockForTests(): void {
  lock = null;
}

const load = (db: Db, id: number): Digest => db.select().from(digests).where(eq(digests.id, id)).get()!;

/** Like ensureToday, but `started`/`digestDate` are known immediately; `done` settles when the build finishes (never rejects). */
export function startToday(deps: EnsureDeps): EnsureResult & { done: Promise<void> } {
  const config = deps.getConfig();
  if (!config.onboarded) return { started: false, digestDate: null, done: Promise.resolve() };
  if (lock) return { started: true, ...lock };
  const today = localDate(deps.now());
  const existing = deps.db.select().from(digests).where(eq(digests.date, today)).get();
  if (existing?.status === 'done') return { started: false, digestDate: today, done: Promise.resolve() };

  const current = {
    digestDate: today,
    done: build(deps, config, today, existing ?? null).finally(() => {
      if (lock === current) lock = null;
      progress.done();
    }),
  };
  lock = current;
  return { started: true, ...current };
}

export async function ensureToday(deps: EnsureDeps): Promise<EnsureResult> {
  const { started, digestDate, done } = startToday(deps);
  await done;
  return { started, digestDate };
}

async function build(deps: EnsureDeps, config: Config, today: string, existing: Digest | null): Promise<void> {
  const { db, now } = deps;
  const startedAt = now().getTime();
  progress.set(0, 'Starting today’s digest…');

  let digest: Digest;
  if (existing) {
    // resume a crashed or failed build from stage + 1
    db.update(digests).set({ status: 'running' }).where(eq(digests.id, existing.id)).run();
    digest = load(db, existing.id);
  } else {
    const lastDone = db.select().from(digests).where(eq(digests.status, 'done')).orderBy(desc(digests.date)).get() ?? null;
    digest = db.insert(digests).values({ date: today, status: 'running', ...computeWindow(lastDone, now()) }).returning().get();
  }

  if (digest.stage < 2) {
    try {
      progress.set(1, 'Fetching sources…');
      const raw = await runS1(db, digest, { fetchFn: deps.fetchFn, now });
      progress.set(2, `Storing ${raw.length} items…`);
      runS2(db, load(db, digest.id), raw, now);
    } catch (err) {
      db.update(digests)
        .set({ status: 'failed', errorCode: 'unknown', errorMessage: redactKey((err as Error).message ?? String(err), config) })
        .where(eq(digests.id, digest.id))
        .run();
      return;
    }
  }

  const llm = deps.llmFactory(config);
  if (!llm) {
    buildRaw(db, load(db, digest.id), { code: 'auth', message: 'No LLM provider or API key is configured.' }, now, startedAt);
    return;
  }

  try {
    for (const s of LLM_STAGES) {
      digest = load(db, digest.id);
      if (digest.stage >= s.stage) continue;
      progress.set(s.stage, typeof s.message === 'string' ? s.message : s.message(db, digest));
      await s.run({ db, digest, llm, config, fetchFn: deps.fetchFn, retryDelaysMs: deps.retryDelaysMs });
    }
  } catch (err) {
    const code = err instanceof LlmError && err.code === 'auth' ? 'auth' : 'llm';
    const message = redactKey((err as Error).message ?? String(err), config).slice(0, 300);
    buildRaw(db, load(db, digest.id), { code, message }, now, startedAt);
    return;
  }

  progress.set(8, 'Saving…');
  runS8(db, load(db, digest.id), now, startedAt);
}
