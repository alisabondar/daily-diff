import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests } from '../db/schema.js';
import type { Digest } from './s1-fetch.js';

/** S8: marks the digest done. Token totals were already added by each stage. */
export function runS8(db: Db, digest: Digest, now: () => Date, startedAt: number): void {
  const completedAt = now().getTime();
  db.update(digests)
    .set({ status: 'done', stage: 8, completedAt, durationMs: Math.max(0, completedAt - startedAt), errorCode: null, errorMessage: null })
    .where(eq(digests.id, digest.id))
    .run();
}
