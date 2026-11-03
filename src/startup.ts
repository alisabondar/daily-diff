import { fileURLToPath } from 'node:url';
import { serve as honoServe } from '@hono/node-server';
import { effectiveConfig, loadConfig, saveConfig } from './config.js';
import { backupIfUpgrading } from './db/backup.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createLlm } from './llm/providers.js';
import { seedSources } from './packs/index.js';
import { paths } from './paths.js';
import { startToday } from './pipeline/run.js';
import { createApp } from './server/app.js';
import type { AppDeps } from './server/deps.js';
import { VERSION } from './version.js';

export interface StartupOpts { port: number; serve?: typeof honoServe; fetchFn?: typeof fetch }

// src/startup.ts → <root>/dist/web; dist/startup.js → <pkg>/dist/web
const WEB_DIR = fileURLToPath(new URL(import.meta.url.includes('/dist/') ? './web' : '../dist/web', import.meta.url));

/** paths → config → backup → migrate → seed sources → serve on 127.0.0.1 → build today's digest in the background. */
export async function startup({ port, serve = honoServe, fetchFn }: StartupOpts): Promise<{ close: () => void }> {
  const p = paths();
  backupIfUpgrading(p, VERSION, loadConfig());
  const db = openDb(p.db);
  runMigrations(db);
  saveConfig({ lastRunVersion: VERSION });
  seedSources(db);

  const deps: AppDeps = {
    db, fetchFn, now: () => new Date(), getConfig: () => effectiveConfig(loadConfig()), saveConfig, llmFactory: createLlm, createLlm, webDir: WEB_DIR,
  };
  const server = serve({ fetch: createApp(deps).fetch, hostname: '127.0.0.1', port });
  if (deps.getConfig().onboarded) void startToday(deps).done;
  return {
    close: () => {
      server.close();
      db.$client.close();
    },
  };
}
