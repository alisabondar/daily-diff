import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { SourceKind, SourceType, sources } from '../db/schema.js';

export const PackSource = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  feedUrl: z.string().min(1),
  kind: SourceKind,
  type: SourceType,
  hnTags: z.enum(['front_page', 'show_hn']).optional(),
  defaultEnabled: z.boolean().optional(),
});

export const Pack = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string(),
  defaultEnabled: z.boolean(),
  sources: z.array(PackSource),
});
export type Pack = z.infer<typeof Pack>;

// src/packs in dev, dist/packs once built (postbuild copies the JSON)
const PACKS_DIR = dirname(fileURLToPath(import.meta.url));

export function loadPacks(dir = PACKS_DIR): Pack[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'books.json').sort();
  const packs = files.map((f) => {
    const parsed = Pack.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    if (!parsed.success) throw new Error(`Invalid pack ${f}: ${parsed.error.message}`);
    return parsed.data;
  });
  const seen = new Set<string>();
  for (const s of packs.flatMap((p) => p.sources)) {
    if (seen.has(s.feedUrl)) throw new Error(`Duplicate feedUrl across packs: ${s.feedUrl}`);
    seen.add(s.feedUrl);
  }
  return packs;
}

/** Upserts every pack source by feedUrl. New rows start disabled; `enabled` is never changed on update. */
export function seedSources(db: Db, packs = loadPacks()): void {
  db.transaction((tx) => {
    for (const pack of packs) {
      for (const s of pack.sources) {
        const fields = { title: s.title, url: s.url, type: s.type, kind: s.kind, hnTags: s.hnTags ?? null, pack: pack.id };
        tx.insert(sources)
          .values({ ...fields, feedUrl: s.feedUrl, enabled: false })
          .onConflictDoUpdate({ target: sources.feedUrl, set: fields })
          .run();
      }
    }
  });
}

/** Enables or disables only the packs whose state changes, so per-source toggles survive. */
export function setPacks(db: Db, enabledPackIds: string[], packs = loadPacks()): void {
  db.transaction((tx) => {
    for (const pack of packs) {
      const rows = tx.select().from(sources).where(eq(sources.pack, pack.id)).all();
      const wasEnabled = rows.some((r) => r.enabled);
      const nowEnabled = enabledPackIds.includes(pack.id);
      if (wasEnabled === nowEnabled) continue;
      const feeds = nowEnabled
        ? pack.sources.filter((s) => s.defaultEnabled ?? pack.defaultEnabled).map((s) => s.feedUrl)
        : rows.map((r) => r.feedUrl);
      if (feeds.length === 0) continue;
      tx.update(sources)
        .set({ enabled: nowEnabled })
        .where(and(eq(sources.pack, pack.id), inArray(sources.feedUrl, feeds)))
        .run();
    }
  });
}

export const Book = z.object({ title: z.string(), author: z.string(), concepts: z.array(z.string()) });
export type Book = z.infer<typeof Book>;

/** The concept pool for Learn (not feeds). */
export function loadBooks(dir = PACKS_DIR): Book[] {
  return z.array(Book).parse(JSON.parse(readFileSync(join(dir, 'books.json'), 'utf8')));
}
