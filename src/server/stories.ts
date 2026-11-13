import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { favorites, favoriteTags, items, sources, stories, storyItems } from '../db/schema.js';

export type Story = typeof stories.$inferSelect;

/** The API shape of a story: its fields, outbound links and favorite state. */
export function serializeStories(db: Db, rows: Story[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((s) => s.id);
  const links = db
    .select({ storyId: storyItems.storyId, url: items.url, sourceTitle: sources.title, discussionUrl: items.discussionUrl, mediaUrl: items.mediaUrl, content: items.content, publishedAt: items.publishedAt })
    .from(storyItems)
    .innerJoin(items, eq(items.id, storyItems.itemId))
    .innerJoin(sources, eq(sources.id, items.sourceId))
    .where(inArray(storyItems.storyId, ids))
    .orderBy(asc(items.id))
    .all();
  const favIds = new Set(db.select({ id: favorites.storyId }).from(favorites).where(inArray(favorites.storyId, ids)).all().map((f) => f.id));
  const tags = db.select().from(favoriteTags).where(inArray(favoriteTags.storyId, ids)).orderBy(asc(favoriteTags.tag)).all();
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    topic: s.topic ?? 'other',
    summary: s.summary,
    stats: s.stats,
    pros: s.pros,
    cons: s.cons,
    links: links.filter((l) => l.storyId === s.id).map(({ storyId: _, content: __, publishedAt: ___, ...l }) => l),
    publishedAt: earliest(links.filter((l) => l.storyId === s.id).map((l) => l.publishedAt)),
    readMinutes: readMinutes(links.filter((l) => l.storyId === s.id).map((l) => l.content)),
    favorite: favIds.has(s.id) ? { tags: tags.filter((t) => t.storyId === s.id).map((t) => t.tag) } : null,
  }));
}

/** A story's publish time: its earliest linked item's (null with no items). */
const earliest = (ts: number[]) => (ts.length ? Math.min(...ts) : null);

const WPM = 230;
/** Estimated minutes to read the longest linked item (feeds often carry only an excerpt, so this is a floor). */
const readMinutes = (contents: string[]) => Math.max(1, Math.round(Math.max(0, ...contents.map((c) => c.split(/\s+/).filter(Boolean).length)) / WPM));

export const storyById = (db: Db, id: number) => db.select().from(stories).where(and(eq(stories.id, id))).get();
