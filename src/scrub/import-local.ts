import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, favorites, favoriteTags, feedback, reads } from '../db/schema.js';
import type { PublishedStory } from '../shared/published.js';
import type { LocalState } from '../web/data/local.js';
import { mergeLocalIntoRemote, type UserStore } from '../web/data/sync.js';
import { publishWithKeys } from './publish-shape.js';
import type { ScrubStore } from './store.js';

export interface ImportCounts { scrubs: number; stories: number; favorites: number; tags: number; feedback: number; reads: number; skipped: number }

/**
 * One-time import of a local ~/.daily-diff database (step 41): every finished digest is published (without Reddit
 * content), then favorites, tags, feedback and reading days are merged into the user's synced rows. Idempotent; never
 * writes to the local database. `skipped` counts favorites/feedback whose story was Reddit-only and so has no key.
 */
export async function importLocal({ db, scrubStore, userStore }: { db: Db; scrubStore: ScrubStore; userStore: UserStore }): Promise<ImportCounts> {
  const remote = await userStore.load();
  if (!remote) throw new Error('No synced settings for this user. Sign in once on the site (and finish setup) first.');

  const published = new Map<number, PublishedStory>();
  let scrubs = 0;
  for (const d of db.select().from(digests).where(eq(digests.status, 'done')).orderBy(asc(digests.date)).all()) {
    const { scrub, keyById } = publishWithKeys(db, d.id, { allowReddit: false });
    await scrubStore.upsertScrub(scrub);
    scrubs++;
    const byKey = new Map(scrub.stories.map((x) => [x.key, x]));
    for (const [id, key] of keyById) published.set(id, byKey.get(key)!);
  }

  let skipped = 0;
  const keep = <T>(storyId: number, f: (s: PublishedStory) => T): T[] => {
    const s = published.get(storyId);
    if (!s) { skipped++; return []; }
    return [f(s)];
  };
  const tags = db.select().from(favoriteTags).all();
  const local: LocalState = {
    ...remote,
    updatedAt: 0, // the synced settings stay; only the lists are merged in
    favorites: db.select().from(favorites).all().flatMap((f) => keep(f.storyId, (s) => ({
      key: s.key, createdAt: f.createdAt, tags: tags.filter((t) => t.storyId === f.storyId).map((t) => t.tag).sort(),
    }))),
    feedback: db.select().from(feedback).all().flatMap((f) => keep(f.storyId, (s) => ({
      key: s.key, kind: f.kind, createdAt: f.createdAt, topic: s.topic, sourceKey: s.sourceKeys[0] ?? null,
    }))),
    reads: db.select().from(reads).all().map((r) => ({ date: r.date, finishedAt: r.finishedAt, quizCorrect: r.quizCorrect, quizTotal: r.quizTotal })),
  };
  await userStore.save(mergeLocalIntoRemote(local, remote));
  return {
    scrubs,
    stories: published.size,
    favorites: local.favorites.length,
    tags: local.favorites.reduce((n, f) => n + f.tags.length, 0),
    feedback: local.feedback.length,
    reads: local.reads.length,
    skipped,
  };
}
