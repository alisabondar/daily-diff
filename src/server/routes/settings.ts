import { Hono } from 'hono';
import { z } from 'zod';
import { Config, KEY_ENV_VARS, Provider, redactKey, resolveKey } from '../../config.js';
import { LlmError } from '../../llm/types.js';
import { PROVIDERS, SUGGESTED_MODELS } from '../../llm/providers.js';
import { startToday } from '../../pipeline/run.js';
import type { AppDeps } from '../deps.js';
import { body } from '../validate.js';

const PutSettings = Config.partial().omit({ onboarded: true, lastRunVersion: true }).strict();
const TestSettings = z.object({
  provider: Provider,
  fastModel: z.string().min(1).optional(),
  strongModel: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export function settingsRoutes(deps: AppDeps) {
  return new Hono()
    .get('/settings', (c) => {
      const { apiKey: _, ...config } = deps.getConfig();
      return c.json({
        ...config,
        keySource: resolveKey(deps.getConfig()).source,
        providers: PROVIDERS.map((id) => {
          const envVar = KEY_ENV_VARS[id];
          return { id, envVar, envKeyPresent: !!(envVar && process.env[envVar]) };
        }),
        suggestedModels: SUGGESTED_MODELS,
      });
    })
    .put('/settings', async (c) => {
      const patch = await body(c, PutSettings);
      const { apiKey, ...rest } = patch;
      const next: Partial<Config> = { ...rest };
      if (apiKey !== undefined) next.apiKey = apiKey === '' ? undefined : apiKey;
      deps.saveConfig(next);
      return c.json({ ok: true });
    })
    .post('/settings/test', async (c) => {
      const t = await body(c, TestSettings);
      const saved = deps.getConfig();
      const merged: Config = {
        ...saved,
        ...t,
        apiKey: t.apiKey || saved.apiKey,
        strongModel: t.strongModel ?? saved.strongModel ?? t.fastModel,
      };
      const llm = deps.createLlm(merged);
      if (!llm) return c.json({ ok: false as const, code: 'auth' as const, message: 'Choose a provider and model, and add an API key.' });
      try {
        await llm.json({ tier: 'fast', task: 'ping', system: 'Reply with {"ok": true}.', prompt: 'ping', schema: z.object({ ok: z.literal(true) }) });
        return c.json({ ok: true as const });
      } catch (err) {
        const code = err instanceof LlmError ? err.code : 'llm';
        return c.json({ ok: false as const, code, message: redactKey((err as Error).message ?? String(err), merged) });
      }
    })
    .post('/onboarding/complete', (c) => {
      deps.saveConfig({ onboarded: true });
      const { started, digestDate } = startToday(deps);
      return c.json({ started, digestDate });
    });
}
