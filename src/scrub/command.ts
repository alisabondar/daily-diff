import { Config, effectiveConfig, envValue, resolveKey } from '../config.js';
import { createLlm } from '../llm/providers.js';
import { localDate } from '../time.js';
import { runScrub } from './publish.js';
import { alreadyPublished, isScrubHour } from './schedule.js';
import { createSupabaseScrubStore } from './supabase-store.js';

/** `daily-diff scrub [--scheduled]`: with --scheduled it runs only between 05:00 and 06:59 ET and only if today isn't published yet. reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM_* and SCRUB_* from the environment. Returns the exit code. */
export async function runScrubCommand(scheduled = false): Promise<number> {
  const url = envValue('SUPABASE_URL')?.value;
  const serviceKey = envValue('SUPABASE_SERVICE_ROLE_KEY')?.value;
  if (!url || !serviceKey) {
    console.error('daily-diff scrub needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }
  const config = effectiveConfig(Config.parse({ onboarded: true }));
  const store = createSupabaseScrubStore(url, serviceKey);
  const now = new Date();
  try {
    if (scheduled && !isScrubHour(now)) {
      console.log('Not 05:00–06:59 in America/New_York; skipping.');
      return 0;
    }
    if (scheduled && (await alreadyPublished(store, localDate(now)))) {
      console.log(`Today's scrub (${localDate(now)}) is already published; skipping.`);
      return 0;
    }
    const dates = await runScrub({
      store,
      config,
      llmFactory: createLlm,
      now: () => now,
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
