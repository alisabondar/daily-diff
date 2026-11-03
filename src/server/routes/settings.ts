import { Hono } from 'hono';
import { z } from 'zod';
import { Config, KEY_ENV_VARS, Provider, redactKey, resolveKey } from '../../config.js';
import { paths } from '../../paths.js';
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
  baseUrl: z.string().optional(),
}).strict();

export function settingsRoutes(deps: AppDeps) {
  return new Hono()
    .get('/settings', (c) => {
      const config = deps.getConfig();
      return c.json({
        ...config,
        keySource: resolveKey(config).source,
        envFile: paths().env,
        providers: PROVIDERS.map((id) => ({ id, envVar: KEY_ENV_VARS[id], keySource: resolveKey({ provider: id }).source })),
        suggestedModels: SUGGESTED_MODELS,
      });
    })
    .put('/settings', async (c) => {
      deps.saveConfig(await body(c, PutSettings));
      return c.json({ ok: true });
    })
    .post('/settings/test', async (c) => {
      const t = await body(c, TestSettings);
      const saved = deps.getConfig();
      const merged: Config = {
        ...saved,
        ...t,
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
