import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { SourceType, sources } from '../../db/schema.js';
import { loadPacks, setPacks } from '../../packs/index.js';
import { discoverFeed } from '../../sources/discover.js';
import type { AppDeps } from '../deps.js';
import { BadRequest, body, parse } from '../validate.js';

const Id = z.coerce.number().int().positive();
const NewSource = z.object({ feedUrl: z.string().url(), title: z.string().trim().min(1), url: z.string().url(), type: SourceType });
const PatchSource = z.object({ enabled: z.boolean().optional(), title: z.string().trim().min(1).optional(), type: SourceType.optional() });
const PostPacks = z.object({ enabled: z.array(z.string()) });
const Discover = z.object({ url: z.string().min(1) });

export function sourceRoutes({ db, fetchFn }: AppDeps) {
  return new Hono()
    .get('/sources', (c) => c.json(db.select().from(sources).orderBy(sources.pack, sources.title).all()))
    .post('/sources', async (c) => {
      const s = await body(c, NewSource);
      if (db.select().from(sources).where(eq(sources.feedUrl, s.feedUrl)).get()) throw new BadRequest('That feed is already added.');
      return c.json(db.insert(sources).values({ ...s, kind: 'rss', pack: null, enabled: true }).returning().get());
    })
    .post('/sources/discover', async (c) => {
      const { url } = await body(c, Discover);
      return c.json(await discoverFeed(url, { fetchFn }));
    })
    .patch('/sources/:id', async (c) => {
      const id = parse(Id, c.req.param('id'));
      const patch = await body(c, PatchSource);
      const row = Object.keys(patch).length
        ? db.update(sources).set(patch).where(eq(sources.id, id)).returning().get()
        : db.select().from(sources).where(eq(sources.id, id)).get();
      return row ? c.json(row) : c.json({ error: 'not found' }, 404);
    })
    .delete('/sources/:id', (c) => {
      const id = parse(Id, c.req.param('id'));
      const row = db.select().from(sources).where(eq(sources.id, id)).get();
      if (!row) return c.json({ error: 'not found' }, 404);
      if (row.pack !== null) throw new BadRequest('Pack sources cannot be deleted — disable instead.');
      db.delete(sources).where(eq(sources.id, id)).run();
      return c.json({ ok: true });
    })
    .get('/packs', (c) => {
      const rows = db.select({ pack: sources.pack, enabled: sources.enabled }).from(sources).all();
      return c.json(
        loadPacks().map((p) => ({
          id: p.id, name: p.name, emoji: p.emoji, defaultEnabled: p.defaultEnabled,
          sourceCount: p.sources.length,
          enabled: rows.some((r) => r.pack === p.id && r.enabled),
        })),
      );
    })
    .post('/packs', async (c) => {
      const { enabled } = await body(c, PostPacks);
      setPacks(db, enabled);
      return c.json({ ok: true });
    });
}
