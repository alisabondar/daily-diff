import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Config } from '../config.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { digests } from '../db/schema.js';
import type { Llm } from '../llm/types.js';
import { loadPacks, seedSources, type Pack } from '../packs/index.js';
import { ensureToday } from '../pipeline/run.js';
import { isRedditFeed } from '../sources/rss.js';
import { localDate } from '../time.js';
import { sourceKey, toPublished } from './publish-shape.js';
import type { ScrubStore } from './store.js';

export interface RunScrubOpts {
  store: ScrubStore;
  config: Config;
  llmFactory: (c: Config) => Llm | null;
  now: () => Date;
  fetchFn?: typeof fetch;
  profile?: string;
  includeReddit?: boolean;
  /** Strings that must never appear in a thrown message (the service key). */
  secrets?: string[];
  retryDelaysMs?: number[];
  /** Defaults to loadPacks(). */
  packs?: Pack[];
}

/** Runs the pipeline in scrub mode on a fresh database and publishes every finished day. Returns the published dates. */
export async function runScrub(opts: RunScrubOpts): Promise<string[]> {
  try {
    return await scrub(opts);
  } catch (err) {
    let message = (err as Error).message ?? String(err);
    for (const s of opts.secrets ?? []) if (s) message = message.split(s).join('[redacted]');
    throw new Error(message);
  }
}

async function scrub({ store, config, llmFactory, now, fetchFn, profile = '', includeReddit = false, retryDelaysMs, packs = loadPacks() }: RunScrubOpts): Promise<string[]> {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'daily-diff-scrub-')), 'scrub.db'));
  try {
    runMigrations(db);
    seedSources(db, packs);
    const today = localDate(now());
    // Start the window where the last published day ended, via a placeholder digest the pipeline reads as "last done".
    const last = await store.lastPublished(today);
    const placeholder = last
      ? db.insert(digests).values({ date: last.date, kind: 'daily', status: 'done', stage: 8, windowStart: last.windowEnd, windowEnd: last.windowEnd }).returning().get().id
      : -1;
    await ensureToday({ db, getConfig: () => config, llmFactory, fetchFn, now, retryDelaysMs, scrub: { profile, includeReddit } });

    const built = db.select().from(digests).where(and(eq(digests.status, 'done'), ne(digests.id, placeholder))).orderBy(asc(digests.date)).all();
    const todays = built.find((d) => d.date === today);
    if (!todays) throw new Error('Scrub build did not finish');
    if (todays.isRaw) throw new Error(`Scrub build ended raw (${todays.errorCode}): ${todays.errorMessage ?? ''}`);

    const catalog = packs.flatMap((p) => p.sources
      .filter((s) => includeReddit || s.kind !== 'rss' || !isRedditFeed(s.feedUrl))
      .map((s) => ({ key: sourceKey(s.feedUrl), pack: p.id, title: s.title, url: s.url, type: s.type, kind: s.kind })));
    await store.upsertCatalog(catalog);
    for (const d of built) await store.upsertScrub(toPublished(db, d.id, { allowReddit: includeReddit }));
    return built.map((d) => d.date);
  } finally {
    db.$client.close();
  }
}
