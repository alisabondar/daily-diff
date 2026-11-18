// Dev helper: publishes a realistic fake scrub to the LOCAL Supabase stack (FakeLlm + fixture feeds mapped onto real pack URLs).
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local secret> TZ=UTC node --import tsx scripts/seed-local-scrub.ts
import { Config } from '../src/config.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runScrub } from '../src/scrub/publish.js';
import { createSupabaseScrubStore } from '../src/scrub/supabase-store.js';
import { handlers } from '../tests/fixtures/llm/handlers.js';
import { fakeFetch, fixture } from '../tests/helpers.js';

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('local stack only');
const dates = await runScrub({
  store: createSupabaseScrubStore(url, key), config: Config.parse({ onboarded: true, provider: 'anthropic' }),
  llmFactory: () => new FakeLlm(handlers), now: () => new Date('2026-10-28T20:00:00Z'), secrets: [key], retryDelaysMs: [0, 0],
  fetchFn: fakeFetch({
    'https://simonwillison.net/atom/everything/': fixture('feeds/blog-atom.xml'),
    'https://newsletter.pragmaticengineer.com/feed': fixture('feeds/blog-rss2.xml'),
    'https://api.substack.com/feed/podcast/10845.rss': fixture('feeds/podcast.xml'),
    'https://hn.algolia.com/api/v1/search_by_date*': fixture('hn/search.json'),
    'https://hn.algolia.com/api/v1/items/*': fixture('hn/item.json'),
  }),
});
console.log('published', dates);
