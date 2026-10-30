import { LlmError } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Up to 3 attempts (1 + one retry per delay). Non-retryable LlmErrors are thrown immediately. */
export async function withRetry<T>(fn: () => Promise<T>, delaysMs: number[] = [1000, 4000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = !(err instanceof LlmError) || err.retryable;
      if (!retryable || attempt >= delaysMs.length) throw err;
      await sleep(delaysMs[attempt]!);
    }
  }
}
