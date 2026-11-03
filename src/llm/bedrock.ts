import { z } from 'zod';
import type { Effort } from '../config.js';
import type { Llm, LlmJsonOpts, LlmUsage } from './types.js';
import { LlmError } from './types.js';

export interface BedrockOpts {
  models: { fast: string; strong: string };
  region: string;
  token: string;
  effort?: Effort;
  fetchFn?: typeof fetch;
}

// https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html (checked 2026-11-03)
const UNSUPPORTED = ['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems'];
const CLAUDE_EFFORTS = new Set<Effort>(['low', 'medium', 'high', 'xhigh', 'max']);
const RETRYABLE = new Set([408, 424, 429]);
const MAX_TOKENS = 16_000;
// First use of a schema compiles a grammar (up to ~90s), so allow more than that.
const TIMEOUT_MS = 120_000;

/** JSON Schema for Bedrock structured outputs: drops unsupported keywords, closes every object. Zod still validates the result. */
export function bedrockSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (UNSUPPORTED.includes(k) || (k === 'minItems' && typeof v === 'number' && v > 1)) continue;
      out[k] = clean(v);
    }
    if (out.type === 'object') out.additionalProperties = false;
    return out;
  };
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** Bedrock Converse over plain fetch with a Bedrock API key (no AWS SDK). */
export class BedrockLlm implements Llm {
  constructor(private opts: BedrockOpts) {}

  async json<T>({ tier, system, prompt, schema }: LlmJsonOpts<T>): Promise<{ data: T; usage: LlmUsage }> {
    const { models, region, token, effort, fetchFn = fetch } = this.opts;
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(models[tier])}/converse`;
    const body = {
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: MAX_TOKENS },
      outputConfig: { textFormat: { type: 'json_schema', structure: { jsonSchema: { name: 'result', schema: JSON.stringify(bedrockSchema(schema)) } } } },
      ...(effort && CLAUDE_EFFORTS.has(effort) ? { additionalModelRequestFields: { output_config: { effort } } } : {}),
    };

    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new LlmError((err as Error)?.message ?? String(err), 'llm', true);
    }
    const json = (await res.json().catch(() => ({}))) as {
      message?: string;
      output?: { message?: { content?: { text?: string }[] } };
      usage?: { inputTokens?: number; outputTokens?: number };
    };
    if (!res.ok) {
      const message = `Bedrock ${res.status}: ${json.message ?? res.statusText}`;
      if (res.status === 401 || res.status === 403) throw new LlmError(message, 'auth', false);
      throw new LlmError(message, 'llm', RETRYABLE.has(res.status) || res.status >= 500);
    }

    const text = (json.output?.message?.content ?? []).map((c) => c.text ?? '').join('');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new LlmError('Model output was not valid JSON', 'llm', true);
    }
    const parsed = schema.safeParse(output);
    if (!parsed.success) throw new LlmError(`Model output failed validation: ${parsed.error.message}`, 'llm', true);
    return { data: parsed.data, usage: { inputTokens: json.usage?.inputTokens ?? 0, outputTokens: json.usage?.outputTokens ?? 0 } };
  }
}
