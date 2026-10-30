import type { Llm, LlmJsonOpts, LlmTask, LlmUsage } from './types.js';
import { LlmError } from './types.js';

export type FakeHandlers = Partial<Record<LlmTask, (prompt: string) => unknown | Error>>;

export class FakeLlm implements Llm {
  calls: { task: LlmTask; tier: 'fast' | 'strong'; system: string; prompt: string }[] = [];
  constructor(private handlers: FakeHandlers) {}

  async json<T>({ task, tier, system, prompt, schema }: LlmJsonOpts<T>): Promise<{ data: T; usage: LlmUsage }> {
    this.calls.push({ task, tier, system, prompt });
    const handler = this.handlers[task];
    if (!handler) throw new Error(`FakeLlm: no handler for task "${task}"`);
    const out = handler(prompt);
    if (out instanceof Error) throw out;
    const parsed = schema.safeParse(out);
    if (!parsed.success) throw new LlmError(`FakeLlm: ${task} output failed validation: ${parsed.error.message}`, 'llm', true);
    return { data: parsed.data, usage: { inputTokens: 10, outputTokens: 5 } };
  }
}
