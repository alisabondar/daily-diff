import { eq, sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { digests } from '../db/schema.js';
import { withRetry } from '../llm/retry.js';
import type { Llm, LlmJsonOpts, LlmUsage } from '../llm/types.js';
import type { Digest } from './s1-fetch.js';

/** What every LLM stage (S3–S7) needs. */
export interface StageCtx {
  db: Db;
  digest: Digest;
  llm: Llm;
  config: Config;
  fetchFn?: typeof fetch;
  retryDelaysMs?: number[];
}

/** Calls the LLM with retries, adding usage to `total`. */
export async function callLlm<T>(ctx: StageCtx, opts: LlmJsonOpts<T>, total: LlmUsage): Promise<T> {
  const { data, usage } = await withRetry(() => ctx.llm.json(opts), ctx.retryDelaysMs);
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  return data;
}

export const newUsage = (): LlmUsage => ({ inputTokens: 0, outputTokens: 0 });

/** Inside a stage's transaction: add usage to the digest totals and record the completed stage. */
export function finishStage(tx: Pick<Db, 'update'>, digestId: number, stage: number, usage: LlmUsage): void {
  tx.update(digests)
    .set({
      stage,
      inputTokens: sql`${digests.inputTokens} + ${usage.inputTokens}`,
      outputTokens: sql`${digests.outputTokens} + ${usage.outputTokens}`,
    })
    .where(eq(digests.id, digestId))
    .run();
}
