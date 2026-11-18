import { Config, effectiveConfig, envValue, resolveKey } from '../config.js';
import { createLlm } from '../llm/providers.js';
import { runScrub } from './publish.js';
import { createSupabaseScrubStore } from './supabase-store.js';

/** `daily-diff scrub`: reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM_* and SCRUB_* from the environment. Returns the exit code. */
export async function runScrubCommand(): Promise<number> {
  const url = envValue('SUPABASE_URL')?.value;
  const serviceKey = envValue('SUPABASE_SERVICE_ROLE_KEY')?.value;
  if (!url || !serviceKey) {
    console.error('daily-diff scrub needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }
  const config = effectiveConfig(Config.parse({ onboarded: true }));
  try {
    const dates = await runScrub({
      store: createSupabaseScrubStore(url, serviceKey),
      config,
      llmFactory: createLlm,
      now: () => new Date(),
      profile: envValue('SCRUB_PROFILE')?.value ?? '',
      includeReddit: envValue('SCRUB_INCLUDE_REDDIT')?.value === 'true',
      secrets: [serviceKey, ...(() => { const k = resolveKey(config); return 'key' in k && k.key ? [k.key] : []; })()],
    });
    console.log(`Published ${dates.join(', ')}`);
    return 0;
  } catch (err) {
    console.error(`Scrub failed: ${(err as Error).message}`);
    return 1;
  }
}
