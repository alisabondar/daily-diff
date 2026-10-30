// Dev only (prompt tuning): npx tsx scripts/rerun-stage.ts <YYYY-MM-DD> <stage 1-8>
// Rewinds that digest to stage − 1 and resumes it. Only today's date actually rebuilds,
// because ensureToday() works on today's digest.
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { digests } from '../src/db/schema.js';
import { createLlm } from '../src/llm/providers.js';
import { ensureToday } from '../src/pipeline/run.js';
import { paths } from '../src/paths.js';

const [date, stageArg] = process.argv.slice(2);
const stage = Number(stageArg);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(stage >= 1 && stage <= 8)) {
  console.error('usage: rerun-stage <YYYY-MM-DD> <stage 1-8>');
  process.exit(1);
}
const db = openDb(paths().db);
runMigrations(db);
const res = db.update(digests).set({ status: 'running', stage: stage - 1, isRaw: false, errorCode: null, errorMessage: null }).where(eq(digests.date, date)).run();
if (res.changes === 0) {
  console.error(`no digest for ${date}`);
  process.exit(1);
}
console.log(await ensureToday({ db, getConfig: loadConfig, llmFactory: createLlm, now: () => new Date() }));
