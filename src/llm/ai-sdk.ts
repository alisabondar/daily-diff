import { generateText, Output, type LanguageModel } from 'ai';
import type { z } from 'zod';
import type { Llm, LlmJsonOpts, LlmUsage } from './types.js';
import { LlmError } from './types.js';

export interface ModelCall {
  (opts: { model: LanguageModel; system: string; prompt: string; schema: z.ZodType<unknown> }): Promise<{ output: unknown; usage: { inputTokens?: number; outputTokens?: number } }>;
}

const AUTH_STATUSES = new Set([401, 402, 403]);

export class AiSdkLlm implements Llm {
  constructor(private models: { fast: LanguageModel; strong: LanguageModel }, private call: ModelCall = defaultCall) {}

  async json<T>({ tier, system, prompt, schema }: LlmJsonOpts<T>): Promise<{ data: T; usage: LlmUsage }> {
    let result: Awaited<ReturnType<ModelCall>>;
    try {
      result = await this.call({ model: this.models[tier], system, prompt, schema });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      const message = (err as Error)?.message ?? String(err);
      if (status !== undefined && AUTH_STATUSES.has(status)) throw new LlmError(message, 'auth', false);
      throw new LlmError(message, 'llm', true);
    }
    const parsed = schema.safeParse(result.output);
    if (!parsed.success) throw new LlmError(`Model output failed validation: ${parsed.error.message}`, 'llm', true);
    return { data: parsed.data, usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 } };
  }
}

// generateObject is deprecated in ai v7; generateText + Output.object is its replacement.
// maxRetries: 0 because withRetry() owns retries.
export const defaultCall: ModelCall = async ({ model, system, prompt, schema }) => {
  const res = await generateText({ model, system, prompt, output: Output.object({ schema }), maxRetries: 0 });
  return { output: res.output, usage: res.usage };
};
