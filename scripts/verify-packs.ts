// Manual network check (not a test): npx tsx scripts/verify-packs.ts
import Parser from 'rss-parser';
import { loadPacks } from '../src/packs/index.js';

const parser = new Parser();
const rows: { pack: string; title: string; status: string; items: number | string; feedUrl: string }[] = [];

await Promise.all(
  loadPacks().flatMap((pack) =>
    pack.sources
      .filter((s) => s.kind === 'rss')
      .map(async (s) => {
        try {
          const res = await fetch(s.feedUrl, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const feed = await parser.parseString(await res.text());
          rows.push({ pack: pack.id, title: s.title, status: 'OK', items: feed.items.length, feedUrl: s.feedUrl });
        } catch (err) {
          rows.push({ pack: pack.id, title: s.title, status: `FAIL ${(err as Error).message}`, items: '-', feedUrl: s.feedUrl });
        }
      }),
  ),
);

rows.sort((a, b) => a.pack.localeCompare(b.pack) || a.title.localeCompare(b.title));
console.table(rows);
const failed = rows.filter((r) => r.status !== 'OK').length;
console.log(`${rows.length - failed} OK, ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
