import type { z } from 'zod';

export type LlmTask = 'group' | 'score' | 'summarize' | 'compose' | 'quickstart' | 'ping' | 'suggest';
export interface LlmUsage { inputTokens: number; outputTokens: number }
export interface LlmJsonOpts<T> {
  tier: 'fast' | 'strong';
  task: LlmTask;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}

export interface Llm {
  /** Returns schema-validated JSON. Throws LlmError. */
  json<T>(opts: LlmJsonOpts<T>): Promise<{ data: T; usage: LlmUsage }>;
}

export class LlmError extends Error {
  constructor(message: string, readonly code: 'auth' | 'llm', readonly retryable: boolean) {
    super(message);
    this.name = 'LlmError';
  }
}
