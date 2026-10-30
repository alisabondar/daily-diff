// npm run demo: builds a demo digest in ./.demo-home from fixtures + FakeLlm (no network, no key).
import { resolve } from 'node:path';

process.env.DAILY_DIFF_HOME = resolve('.demo-home');

const { saveConfig, loadConfig } = await import('../src/config.js');
const { openDb } = await import('../src/db/client.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { sources } = await import('../src/db/schema.js');
const { FakeLlm } = await import('../src/llm/fake.js');
const { ensureToday } = await import('../src/pipeline/run.js');
const { paths } = await import('../src/paths.js');
const { fakeFetch, fixture } = await import('../tests/helpers.js');
const { handlers } = await import('../tests/fixtures/llm/handlers.js');

saveConfig({ onboarded: true, profile: 'Demo reader: a backend engineer curious about AI tools.' });
const db = openDb(paths().db);
runMigrations(db);

const demoSources = [
  { feedUrl: 'demo:blog', title: 'Demo Blog', type: 'blog' as const, body: fixture('feeds/blog-rss2.xml') },
  { feedUrl: 'demo:atom', title: 'Demo Atom', type: 'blog' as const, body: fixture('feeds/blog-atom.xml') },
  { feedUrl: 'demo:pod', title: 'Demo Pod', type: 'podcast' as const, body: fixture('feeds/podcast.xml') },
  { feedUrl: 'demo:yt', title: 'Demo Tube', type: 'video' as const, body: fixture('feeds/youtube.xml') },
  { feedUrl: 'demo:reddit', title: 'r/Demo', type: 'community' as const, body: fixture('feeds/reddit.xml') },
];
const routes: Record<string, string> = {
  'https://hn.algolia.com/api/v1/search_by_date*': fixture('hn/search.json'),
  'https://hn.algolia.com/api/v1/items/*': fixture('hn/item.json'),
};
for (const s of demoSources) {
  const feedUrl = `https://demo.local/${s.feedUrl.slice(5)}.xml`;
  routes[feedUrl] = s.body;
  db.insert(sources).values({ kind: 'rss', type: s.type, title: s.title, url: 'https://demo.local', feedUrl, enabled: true }).onConflictDoNothing().run();
}
db.insert(sources).values({ kind: 'hn', type: 'community', title: 'Show HN', url: 'https://news.ycombinator.com/show', feedUrl: 'hn:show_hn', hnTags: 'show_hn', enabled: true }).onConflictDoNothing().run();

// fixtures are dated 2026-10-28, so build "today" as that evening
const res = await ensureToday({
  db,
  getConfig: loadConfig,
  llmFactory: () => new FakeLlm(handlers),
  fetchFn: fakeFetch(routes),
  now: () => new Date('2026-10-28T20:00:00Z'),
  retryDelaysMs: [0, 0],
});
console.log('demo digest:', res, 'home:', process.env.DAILY_DIFF_HOME);
