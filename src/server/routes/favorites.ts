import { desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { favorites, favoriteTags, feedback, stories } from '../../db/schema.js';
import type { AppDeps } from '../deps.js';
import { serializeStories, storyById } from '../stories.js';
import { body, parse } from '../validate.js';

const Id = z.coerce.number().int().positive();
const Tag = z.string().transform((t) => t.trim().toLowerCase()).pipe(z.string().min(1).max(32));
const PutFavorite = z.object({ tags: z.array(Tag).max(20) });
const Feedback = z.object({ storyId: z.number().int().positive(), kind: z.literal('less_like_this') });

export function favoriteRoutes({ db }: AppDeps) {
  return new Hono()
    .get('/favorites', (c) => {
      const tag = c.req.query('tag')?.trim().toLowerCase();
      const ids = tag
        ? db.select({ id: favorites.storyId }).from(favorites).innerJoin(favoriteTags, eq(favoriteTags.storyId, favorites.storyId)).where(eq(favoriteTags.tag, tag)).orderBy(desc(favorites.createdAt), desc(favorites.storyId)).all()
        : db.select({ id: favorites.storyId }).from(favorites).orderBy(desc(favorites.createdAt), desc(favorites.storyId)).all();
      const rows = ids.length ? db.select().from(stories).where(inArray(stories.id, ids.map((r) => r.id))).all() : [];
      const order = new Map(ids.map((r, i) => [r.id, i]));
      rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      const tags = db.select({ tag: favoriteTags.tag, count: sql<number>`count(*)` }).from(favoriteTags).groupBy(favoriteTags.tag).orderBy(favoriteTags.tag).all();
      return c.json({ stories: serializeStories(db, rows), tags });
    })
    .put('/favorites/:storyId', async (c) => {
      const storyId = parse(Id, c.req.param('storyId'));
      const { tags } = await body(c, PutFavorite);
      if (!storyById(db, storyId)) return c.json({ error: 'story not found' }, 404);
      db.transaction((tx) => {
        tx.insert(favorites).values({ storyId }).onConflictDoNothing().run();
        tx.delete(favoriteTags).where(eq(favoriteTags.storyId, storyId)).run();
        const unique = [...new Set(tags)];
        if (unique.length) tx.insert(favoriteTags).values(unique.map((tag) => ({ storyId, tag }))).run();
      });
      return c.json({ ok: true });
    })
    .delete('/favorites/:storyId', (c) => {
      const storyId = parse(Id, c.req.param('storyId'));
      db.transaction((tx) => {
        tx.delete(favoriteTags).where(eq(favoriteTags.storyId, storyId)).run();
        tx.delete(favorites).where(eq(favorites.storyId, storyId)).run();
      });
      return c.json({ ok: true });
    })
    .post('/feedback', async (c) => {
      const f = await body(c, Feedback);
      if (!storyById(db, f.storyId)) return c.json({ error: 'story not found' }, 404);
      db.insert(feedback).values(f).run();
      return c.json({ ok: true });
    });
}
