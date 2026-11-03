import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Config, effectiveConfig, envOverrides, loadConfig, redactKey, resolveKey, saveConfig } from '../src/config.js';
import { paths } from '../src/paths.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.DAILY_DIFF_HOME = home;
});
let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'dd-cwd-'));
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const v of ['DAILY_DIFF_HOME', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL', 'LLM_FAST_MODEL', 'LLM_EFFORT']) delete process.env[v];
});

const defaults = Config.parse({});

test('paths live under DAILY_DIFF_HOME and dirs exist', () => {
  const p = paths();
  expect(p.home).toBe(home);
  expect(p.config).toBe(join(home, 'config.json'));
  expect(p.env).toBe(join(home, '.env'));
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

test('key comes from the env var, else from $DAILY_DIFF_HOME/.env, else none', () => {
  const c = { ...defaults, provider: 'anthropic' as const };
  expect(resolveKey(c)).toEqual({ source: 'none' });
  writeFileSync(join(home, '.env'), '# keys\nOPENAI_API_KEY=other\nANTHROPIC_API_KEY="file-key"\n');
  expect(resolveKey(c)).toEqual({ key: 'file-key', source: 'file', file: join(home, '.env') });
  process.env.ANTHROPIC_API_KEY = 'env-key';
  expect(resolveKey(c)).toEqual({ key: 'env-key', source: 'env' });
});

test('.env edits apply without a restart', () => {
  const c = { ...defaults, provider: 'anthropic' as const };
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=first');
  expect(resolveKey(c).key).toBe('first');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=second');
  expect(resolveKey(c).key).toBe('second');
});

test('a key from .env is redacted too', () => {
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=sk-file-777');
  expect(redactKey('bad key sk-file-777', { ...defaults, provider: 'anthropic' })).toBe('bad key [redacted]');
});

test('a legacy apiKey in config.json is ignored and dropped on save', () => {
  writeFileSync(paths().config, JSON.stringify({ provider: 'anthropic', apiKey: 'old-key' }));
  expect(resolveKey(loadConfig())).toEqual({ source: 'none' });
  saveConfig({ profile: 'x' });
  expect(readFileSync(paths().config, 'utf8')).not.toContain('old-key');
});

test('./.env in the working directory wins over $DAILY_DIFF_HOME/.env; the real env wins over both', () => {
  const c = { ...defaults, provider: 'anthropic' as const };
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=home-key');
  writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=cwd-key');
  expect(resolveKey(c)).toEqual({ key: 'cwd-key', source: 'file', file: join(cwd, '.env') });
  process.env.ANTHROPIC_API_KEY = 'env-key';
  expect(resolveKey(c)).toEqual({ key: 'env-key', source: 'env' });
});

test('LLM_PROVIDER / LLM_MODEL / LLM_EFFORT override the saved config', () => {
  const saved = { ...defaults, provider: 'openai' as const, fastModel: 'a', strongModel: 'b' };
  expect(effectiveConfig(saved)).toEqual(saved);
  expect(envOverrides()).toEqual({ fields: [], invalid: [] });
  writeFileSync(join(cwd, '.env'), 'LLM_PROVIDER=anthropic\nLLM_MODEL=big\nLLM_EFFORT=low\n');
  expect(effectiveConfig(saved)).toMatchObject({ provider: 'anthropic', fastModel: 'big', strongModel: 'big', effort: 'low' });
  expect(envOverrides().fields.sort()).toEqual(['effort', 'fastModel', 'provider', 'strongModel']);
  process.env.LLM_FAST_MODEL = 'small';
  expect(effectiveConfig(saved)).toMatchObject({ fastModel: 'small', strongModel: 'big' });
});

test('invalid LLM_PROVIDER / LLM_EFFORT values are ignored and reported', () => {
  const saved = { ...defaults, provider: 'openai' as const };
  writeFileSync(join(cwd, '.env'), 'LLM_PROVIDER=bedrock\nLLM_EFFORT=turbo\n');
  expect(effectiveConfig(saved)).toMatchObject({ provider: 'openai' });
  expect(effectiveConfig(saved).effort).toBeUndefined();
  expect(envOverrides()).toEqual({ fields: [], invalid: [{ name: 'LLM_PROVIDER', value: 'bedrock' }, { name: 'LLM_EFFORT', value: 'turbo' }] });
});
