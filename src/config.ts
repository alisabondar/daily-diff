import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import { paths } from './paths.js';

export const Provider = z.enum(['anthropic', 'openai', 'google', 'openrouter', 'ollama']);
export type Provider = z.infer<typeof Provider>;

export const Effort = z.enum(['provider-default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export type Effort = z.infer<typeof Effort>;

export const Config = z.object({
  onboarded: z.boolean().default(false),
  provider: Provider.optional(),
  fastModel: z.string().optional(),
  strongModel: z.string().optional(),
  baseUrl: z.string().optional(), // ollama only
  effort: Effort.optional(), // env only (LLM_EFFORT)
  profile: z.string().default(''),
  highlightsCap: z.number().int().min(4).max(20).default(10),
  relevanceThreshold: z.number().int().min(0).max(10).default(5),
  lastRunVersion: z.string().optional(),
});
export type Config = z.infer<typeof Config>;

/** §B.5 key env var per provider; ollama needs no key. */
export const KEY_ENV_VARS: Record<Provider, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: null,
};

export function loadConfig(): Config {
  const file = paths().config;
  if (!existsSync(file)) return Config.parse({});
  try {
    return Config.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    renameSync(file, `${file}.bad-${Date.now()}`);
    return Config.parse({});
  }
}

export function saveConfig(partial: Partial<Config>): Config {
  const config = Config.parse({ ...loadConfig(), ...partial });
  const file = paths().config;
  writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  return config;
}

export type KeySource = 'env' | 'file' | 'none';

/** A variable from the real env, else ./.env, else $DAILY_DIFF_HOME/.env. Files are re-read on every call. */
export function envValue(name: string): { value: string; source: 'env' } | { value: string; source: 'file'; file: string } | undefined {
  if (process.env[name]) return { value: process.env[name], source: 'env' };
  for (const file of [join(process.cwd(), '.env'), paths().env]) {
    const value = existsSync(file) ? parseEnv(readFileSync(file, 'utf8'))[name] : undefined;
    if (value) return { value, source: 'file', file };
  }
  return undefined;
}

/** The provider's key from its env var name (see envValue for where it's looked up). */
export function resolveKey(config: Pick<Config, 'provider'>): { key?: string; source: KeySource; file?: string } {
  const envVar = config.provider ? KEY_ENV_VARS[config.provider] : null;
  const v = envVar ? envValue(envVar) : undefined;
  if (!v) return { source: 'none' };
  return v.source === 'env' ? { key: v.value, source: 'env' } : { key: v.value, source: 'file', file: v.file };
}

/** Rule 7: replaces every occurrence of the active API key with [redacted]. */
export function redactKey(message: string, config: Config): string {
  const { key } = resolveKey(config);
  return key ? message.split(key).join('[redacted]') : message;
}

export interface EnvOverrides { fields: (keyof Config)[]; invalid: { name: string; value: string }[] }

function readOverrides(): { patch: Partial<Config>; invalid: { name: string; value: string }[] } {
  const patch: Partial<Config> = {};
  const invalid: { name: string; value: string }[] = [];
  const provider = envValue('LLM_PROVIDER')?.value;
  if (provider !== undefined) {
    const p = Provider.safeParse(provider);
    if (p.success) patch.provider = p.data;
    else invalid.push({ name: 'LLM_PROVIDER', value: provider });
  }
  const model = envValue('LLM_MODEL')?.value;
  const fast = envValue('LLM_FAST_MODEL')?.value ?? model;
  if (fast) patch.fastModel = fast;
  if (model) patch.strongModel = model;
  const effort = envValue('LLM_EFFORT')?.value;
  if (effort !== undefined) {
    const e = Effort.safeParse(effort);
    if (e.success) patch.effort = e.data;
    else invalid.push({ name: 'LLM_EFFORT', value: effort });
  }
  return { patch, invalid };
}

/** Applies LLM_PROVIDER / LLM_MODEL / LLM_FAST_MODEL / LLM_EFFORT over the saved config. */
export function effectiveConfig(config: Config): Config {
  return { ...config, ...readOverrides().patch };
}

/** Which config fields env overrides, and any LLM_* values that were ignored as invalid. */
export function envOverrides(): EnvOverrides {
  const { patch, invalid } = readOverrides();
  return { fields: Object.keys(patch) as (keyof Config)[], invalid };
}
