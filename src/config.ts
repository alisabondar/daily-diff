import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { paths } from './paths.js';

export const Provider = z.enum(['anthropic', 'openai', 'google', 'openrouter', 'ollama']);
export type Provider = z.infer<typeof Provider>;

export const Config = z.object({
  onboarded: z.boolean().default(false),
  provider: Provider.optional(),
  fastModel: z.string().optional(),
  strongModel: z.string().optional(),
  baseUrl: z.string().optional(), // ollama only
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

/** The provider's key: its env var, else the same name in $DAILY_DIFF_HOME/.env (re-read each call). */
export function resolveKey(config: Pick<Config, 'provider'>): { key?: string; source: KeySource } {
  const envVar = config.provider ? KEY_ENV_VARS[config.provider] : null;
  if (!envVar) return { source: 'none' };
  if (process.env[envVar]) return { key: process.env[envVar], source: 'env' };
  const file = paths().env;
  const fileKey = existsSync(file) ? parseEnv(readFileSync(file, 'utf8'))[envVar] : undefined;
  return fileKey ? { key: fileKey, source: 'file' } : { source: 'none' };
}

/** Rule 7: replaces every occurrence of the active API key with [redacted]. */
export function redactKey(message: string, config: Config): string {
  const { key } = resolveKey(config);
  return key ? message.split(key).join('[redacted]') : message;
}
