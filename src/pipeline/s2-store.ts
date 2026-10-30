import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, items } from '../db/schema.js';
import { canonicalUrl } from '../sources/normalize.js';
import type { RawItem } from '../sources/types.js';
import type { Digest } from './s1-fetch.js';

export type Item = typeof items.$inferSelect;

/** Stores items by canonical URL (first source wins, discussion links merged), then marks stages 1–2 done. */
export function runS2(db: Db, digest: Digest, raw: RawItem[], now: () => Date): void {
  const fetchedAt = now().getTime();
  db.transaction((tx) => {
    for (const r of raw) {
      let url: string;
      try {
        url = canonicalUrl(r.url);
      } catch {
        continue; // unparseable link
      }
      tx.insert(items)
        .values({ ...r, url, publishedAt: r.publishedAt ?? fetchedAt, fetchedAt })
        .onConflictDoUpdate({
          target: items.url,
          set: {
            discussionUrl: sql`COALESCE(${items.discussionUrl}, excluded.discussion_url)`,
            hnId: sql`COALESCE(${items.hnId}, excluded.hn_id)`,
          },
        })
        .run();
    }
    tx.update(digests).set({ windowEnd: fetchedAt, stage: 2 }).where(eq(digests.id, digest.id)).run();
  });
}

/** Items first seen in this digest's window, (windowStart, windowEnd]. */
export function windowItems(db: Db, digest: Pick<Digest, 'windowStart' | 'windowEnd'>): Item[] {
  return db.select().from(items).where(and(gt(items.fetchedAt, digest.windowStart), lte(items.fetchedAt, digest.windowEnd))).all();
}
