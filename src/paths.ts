import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Paths { home: string; db: string; config: string; env: string; backups: string }

export function paths(): Paths {
  const home = resolve(process.env.DAILY_DIFF_HOME || join(homedir(), '.daily-diff'));
  const backups = join(home, 'backups');
  mkdirSync(backups, { recursive: true });
  return { home, db: join(home, 'daily-diff.db'), config: join(home, 'config.json'), env: join(home, '.env'), backups };
}
