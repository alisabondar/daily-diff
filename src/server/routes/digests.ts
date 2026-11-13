import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { digestEntries, digests, HIGHLIGHT_SECTIONS, learnItems, MORE_SECTIONS, sources, stories } from '../../db/schema.js';
import { progress } from '../../pipeline/progress.js';
import { startToday } from '../../pipeline/run.js';
import { localDate } from '../../time.js';
import type { AppDeps } from '../deps.js';
import { serializeStories } from '../stories.js';
import { BadRequest, parse } from '../validate.js';

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(365).default(60), before: DateParam.optional() });

/** "agent sdk" → `"agent"* "sdk"*`: plain terms with prefix matching, no FTS syntax from the user. */
export function ftsQuery(q: string): string {
  return (q.match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => `"${t}"*`).join(' ');
}

export function digestRoutes(deps: AppDeps) {
  const { db } = deps;
  return new Hono()
    .post('/ensure', (c) => {
      const { started, digestDate } = startToday(deps);
      return c.json({ started, digestDate });
    })
    .get('/status', (c) => {
      const config = deps.getConfig();
      const t = db.select().from(digests).where(eq(digests.date, localDate(deps.now()))).get();
      const latest = db.select().from(digests).orderBy(desc(digests.date)).get();
      const latestDone = db.select({ date: digests.date }).from(digests).where(eq(digests.status, 'done')).orderBy(desc(digests.date)).get();
      const failedIds = latest?.failedSourceIds ?? [];
      const failedSources = failedIds.length
        ? db.select({ id: sources.id, title: sources.title, lastError: sources.lastError }).from(sources).where(inArray(sources.id, failedIds)).all()
        : [];
      return c.json({
        onboarded: config.onboarded,
        progress: progress.get(),
        today: t ? { date: t.date, status: t.status, stage: t.stage, isRaw: t.isRaw, errorCode: t.errorCode } : null,
        latestDoneDate: latestDone?.date ?? null,
        failedSources,
      });
    })
    .get('/digests', (c) => {
      const q = parse(ListQuery, c.req.query());
      const rows = db
        .select({ date: digests.date, kind: digests.kind, isRaw: digests.isRaw, highlightCount: sql<number>`count(${digestEntries.storyId})` })
        .from(digests)
        .leftJoin(digestEntries, and(eq(digestEntries.digestId, digests.id), eq(digestEntries.tab, 'highlights')))
        .where(and(eq(digests.status, 'done'), q.before ? lt(digests.date, q.before) : undefined))
        .groupBy(digests.id)
        .orderBy(desc(digests.date))
        .limit(q.limit)
        .all();
      return c.json(rows);
    })
    .get('/digests/:date', (c) => {
      const date = parse(DateParam, c.req.param('date'));
      const d = db.select().from(digests).where(eq(digests.date, date)).get();
      if (!d) return c.json({ error: 'not found' }, 404);
      const entries = db
        .select({ entry: digestEntries, story: stories })
        .from(digestEntries)
        .innerJoin(stories, eq(stories.id, digestEntries.storyId))
        .where(eq(digestEntries.digestId, d.id))
        .orderBy(asc(digestEntries.position))
        .all();
      const serialized = new Map(serializeStories(db, entries.map((e) => e.story)).map((s) => [s.id, s]));
      const group = (tab: 'highlights' | 'more', order: readonly string[]) =>
        order
          .map((section) => ({ section, stories: entries.filter((e) => e.entry.tab === tab && e.entry.section === section).map((e) => serialized.get(e.story.id)!) }))
          .filter((g) => g.stories.length > 0);
      const learn = db.select().from(learnItems).where(eq(learnItems.digestId, d.id)).all();
      const concept = learn.find((l) => l.type === 'concept');
      const quickstart = learn.find((l) => l.type === 'quickstart');
      const { failedSourceIds: _, ...meta } = d;
      return c.json({
        meta,
        highlights: group('highlights', HIGHLIGHT_SECTIONS),
        more: group('more', MORE_SECTIONS),
        learn: !d.isRaw && concept && quickstart ? { concept, quickstart } : null,
      });
    })
    .get('/search', (c) => {
      const match = ftsQuery(c.req.query('q') ?? '');
      if (!match) throw new BadRequest('q is required');
      const hits = db.all<{ id: number }>(sql`select rowid as id from stories_fts where stories_fts match ${match} order by rank limit 50`);
      if (hits.length === 0) return c.json([]);
      const rows = db.select({ story: stories, date: digests.date }).from(stories).innerJoin(digests, eq(digests.id, stories.digestId)).where(inArray(stories.id, hits.map((h) => h.id))).all();
      const byId = new Map(rows.map((r) => [r.story.id, r]));
      const ordered = hits.map((h) => byId.get(h.id)).filter((r) => r !== undefined);
      const serialized = serializeStories(db, ordered.map((r) => r.story));
      return c.json(serialized.map((story, i) => ({ story, digestDate: ordered[i]!.date })));
    });
}

