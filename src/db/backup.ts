import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import type { Paths } from '../paths.js';

const KEEP = 5;
const stamp = (f: string) => Number(/-(\d+)\.db$/.exec(f)?.[1] ?? 0);

/** Copies the DB before migrations when the app version changed. The caller migrates, then saves lastRunVersion. */
export function backupIfUpgrading(p: Paths, currentVersion: string, config: Config): string | null {
  if (!existsSync(p.db) || config.lastRunVersion === currentVersion) return null;
  const out = join(p.backups, `daily-diff-${config.lastRunVersion ?? 'unknown'}-${Date.now()}.db`);
  copyFileSync(p.db, out);
  const backups = readdirSync(p.backups).filter((f) => f.startsWith('daily-diff-') && f.endsWith('.db'));
  backups.sort((a, b) => stamp(b) - stamp(a));
  for (const f of backups.slice(KEEP)) rmSync(join(p.backups, f));
  return out;
}
