import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Config, loadConfig, resolveKey, saveConfig } from '../src/config.js';
import { paths } from '../src/paths.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.DAILY_DIFF_HOME = home;
});
afterEach(() => {
  delete process.env.DAILY_DIFF_HOME;
  delete process.env.ANTHROPIC_API_KEY;
});

const defaults = Config.parse({});

test('paths live under DAILY_DIFF_HOME and dirs exist', () => {
  const p = paths();
  expect(p.home).toBe(home);
  expect(p.config).toBe(join(home, 'config.json'));
  expect(p.db.startsWith(home)).toBe(true);
  expect(statSync(p.backups).isDirectory()).toBe(true);
});

test('missing file gives defaults', () => {
  expect(loadConfig()).toEqual(defaults);
});

test('save then load round-trips and merges', () => {
  saveConfig({ provider: 'anthropic', profile: 'backend dev' });
  saveConfig({ highlightsCap: 12 });
  expect(loadConfig()).toEqual({ ...defaults, provider: 'anthropic', profile: 'backend dev', highlightsCap: 12 });
});

test.skipIf(process.platform === 'win32')('config file mode is 0600', () => {
  saveConfig({ onboarded: true });
  expect(statSync(paths().config).mode & 0o777).toBe(0o600);
});

test('invalid file is renamed .bad-* and defaults returned', () => {
  writeFileSync(paths().config, '{ not json');
  expect(loadConfig()).toEqual(defaults);
  const files = readdirSync(home);
  expect(files.some((f) => f.startsWith('config.json.bad-'))).toBe(true);
  expect(files).not.toContain('config.json');
});

test('schema-invalid file is also renamed', () => {
  writeFileSync(paths().config, JSON.stringify({ highlightsCap: 99 }));
  expect(loadConfig()).toEqual(defaults);
  expect(readdirSync(home).some((f) => f.startsWith('config.json.bad-'))).toBe(true);
});

test('env key wins over config key', () => {
  process.env.ANTHROPIC_API_KEY = 'env-key';
  const c = { ...defaults, provider: 'anthropic' as const, apiKey: 'cfg-key' };
  expect(resolveKey(c)).toEqual({ key: 'env-key', source: 'env' });
  delete process.env.ANTHROPIC_API_KEY;
  expect(resolveKey(c)).toEqual({ key: 'cfg-key', source: 'config' });
  expect(resolveKey({ ...c, apiKey: undefined })).toEqual({ source: 'none' });
});
