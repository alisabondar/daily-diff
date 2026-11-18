// Manual check for step 34: runs the real Supabase store against the LOCAL stack with the FakeLlm and fixture feeds.
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local secret> node --import tsx scripts/scrub-local-check.ts
import { Config } from '../src/config.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runScrub } from '../src/scrub/publish.js';
import { createSupabaseScrubStore } from '../src/scrub/supabase-store.js';
import { handlers } from '../tests/fixtures/llm/handlers.js';
import { fakeFetch, fixture } from '../tests/helpers.js';

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url.startsWith('http://127.0.0.1')) throw new Error('local stack only');
const packs = [{ id: 'eng', name: 'Eng', emoji: 'x', defaultEnabled: true, sources: [{ title: 'Blog', url: 'https://blog.dev', feedUrl: 'https://blog.dev/feed', kind: 'rss' as const, type: 'blog' as const }] }];
const dates = await runScrub({
  store: createSupabaseScrubStore(url, key), config: Config.parse({ onboarded: true, provider: 'anthropic' }),
  llmFactory: () => new FakeLlm(handlers), now: () => new Date('2026-10-28T20:00:00Z'), packs,
  fetchFn: fakeFetch({ 'https://blog.dev/feed': fixture('feeds/blog-rss2.xml') }), secrets: [key], retryDelaysMs: [0, 0],
});
console.log('published', dates);
