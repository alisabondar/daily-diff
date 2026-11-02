import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { favorites, favoriteTags, items, sources, stories, storyItems } from '../db/schema.js';

export type Story = typeof stories.$inferSelect;

/** The API shape of a story: its fields, outbound links and favorite state. */
export function serializeStories(db: Db, rows: Story[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((s) => s.id);
  const links = db
    .select({ storyId: storyItems.storyId, url: items.url, sourceTitle: sources.title, discussionUrl: items.discussionUrl, mediaUrl: items.mediaUrl })
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
    summary: s.summary,
    stats: s.stats,
    pros: s.pros,
    cons: s.cons,
    links: links.filter((l) => l.storyId === s.id).map(({ storyId: _, ...l }) => l),
    favorite: favIds.has(s.id) ? { tags: tags.filter((t) => t.storyId === s.id).map((t) => t.tag) } : null,
  }));
}

export const storyById = (db: Db, id: number) => db.select().from(stories).where(and(eq(stories.id, id))).get();
