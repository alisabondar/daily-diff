import { Hono } from 'hono';
import { z } from 'zod';
import { reads } from '../../db/schema.js';
import { computeStreak } from '../../streak.js';
import { localDate } from '../../time.js';
import type { AppDeps } from '../deps.js';
import { body } from '../validate.js';

const Count = z.number().int().min(0).max(10);
const ReadBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('finished') }),
  z.object({ kind: z.literal('quiz'), correct: Count, total: Count }).refine((b) => b.correct <= b.total, 'correct must be ≤ total'),
]);

export function readRoutes({ db, now }: AppDeps) {
  const streak = () => computeStreak(db.select({ date: reads.date }).from(reads).all().map((r) => r.date), localDate(now()));
  return new Hono()
    .post('/reads', async (c) => {
      const b = await body(c, ReadBody);
      const set = b.kind === 'finished' ? { finishedAt: now().getTime() } : { quizCorrect: b.correct, quizTotal: b.total };
      db.insert(reads).values({ date: localDate(now()), ...set }).onConflictDoUpdate({ target: reads.date, set }).run();
      return c.json(streak());
    })
    .get('/streak', (c) => c.json(streak()));
}
