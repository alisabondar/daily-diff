import { afterEach, expect, test } from 'vitest';
import { z } from 'zod';
import { Config } from '../src/config.js';
import { BedrockLlm, bedrockSchema } from '../src/llm/bedrock.js';
import { createLlm } from '../src/llm/providers.js';
import { LlmError } from '../src/llm/types.js';

afterEach(() => {
  delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  delete process.env.AWS_REGION;
});

const schema = z.object({ items: z.array(z.object({ id: z.number().int().min(0), title: z.string().min(1) })).length(4), note: z.string().max(10) });
const opts = { tier: 'strong' as const, task: 'ping' as const, system: 'sys', prompt: 'hello', schema: z.object({ ok: z.literal(true) }) };
const models = { fast: 'us.anthropic.claude-haiku-5-5', strong: 'us.anthropic.claude-sonnet-5-5' };

function fakeBedrock(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const ok = (text: string) => ({ output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });

test('bedrockSchema closes every object and drops keywords Bedrock rejects', () => {
  const s = bedrockSchema(schema);
  const text = JSON.stringify(s);
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems', '"minItems":4', '$schema']) expect(text).not.toContain(k);
  expect(s).toMatchObject({ type: 'object', additionalProperties: false, required: ['items', 'note'] });
  expect((s as any).properties.items.items).toMatchObject({ type: 'object', additionalProperties: false });
});

test('sends a Converse request with the bearer token, tier model, system, prompt and json_schema output', async () => {
  const { fetchFn, calls } = fakeBedrock(200, ok('{"ok":true}'));
  await new BedrockLlm({ models, region: 'us-east-1', token: 'tok-123', fetchFn }).json(opts);
  expect(calls).toHaveLength(1);
  const { url, init } = calls[0]!;
  expect(url).toBe('https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-sonnet-5-5/converse');
  expect(init.method).toBe('POST');
  expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
  const body = JSON.parse(init.body as string);
  expect(body.system).toEqual([{ text: 'sys' }]);
  expect(body.messages).toEqual([{ role: 'user', content: [{ text: 'hello' }] }]);
  expect(body.inferenceConfig.maxTokens).toBeGreaterThan(0);
  expect(body.outputConfig.textFormat.type).toBe('json_schema');
  expect(JSON.parse(body.outputConfig.textFormat.structure.jsonSchema.schema)).toMatchObject({ type: 'object', additionalProperties: false });
  expect(body).not.toHaveProperty('additionalModelRequestFields');
});

test('uses the fast model for the fast tier and URL-encodes the model id', async () => {
  const { fetchFn, calls } = fakeBedrock(200, ok('{"ok":true}'));
  await new BedrockLlm({ models: { fast: 'anthropic.x-v1:0', strong: 's' }, region: 'eu-west-1', token: 't', fetchFn }).json({ ...opts, tier: 'fast' });
  expect(calls[0]!.url).toBe('https://bedrock-runtime.eu-west-1.amazonaws.com/model/anthropic.x-v1%3A0/converse');
});

test('passes Claude effort through additionalModelRequestFields, and skips values Claude lacks', async () => {
  const a = fakeBedrock(200, ok('{"ok":true}'));
  await new BedrockLlm({ models, region: 'us-east-1', token: 't', effort: 'low', fetchFn: a.fetchFn }).json(opts);
  expect(JSON.parse(a.calls[0]!.init.body as string).additionalModelRequestFields).toEqual({ output_config: { effort: 'low' } });
  const b = fakeBedrock(200, ok('{"ok":true}'));
  await new BedrockLlm({ models, region: 'us-east-1', token: 't', effort: 'provider-default', fetchFn: b.fetchFn }).json(opts);
  expect(JSON.parse(b.calls[0]!.init.body as string)).not.toHaveProperty('additionalModelRequestFields');
});

test('parses and validates the JSON text, and reports usage', async () => {
  const { fetchFn } = fakeBedrock(200, ok('{"ok":true}'));
  expect(await new BedrockLlm({ models, region: 'us-east-1', token: 't', fetchFn }).json(opts)).toEqual({ data: { ok: true }, usage: { inputTokens: 12, outputTokens: 5 } });
});

test('invalid or schema-failing output is a retryable llm error', async () => {
  for (const text of ['not json', '{"ok":false}']) {
    const { fetchFn } = fakeBedrock(200, ok(text));
    await expect(new BedrockLlm({ models, region: 'us-east-1', token: 't', fetchFn }).json(opts)).rejects.toMatchObject({ code: 'llm', retryable: true });
  }
});

test('maps HTTP errors: 401/403 auth, 408/424/429/5xx retryable, other 4xx not', async () => {
  const cases: [number, string, boolean][] = [[403, 'auth', false], [401, 'auth', false], [429, 'llm', true], [408, 'llm', true], [424, 'llm', true], [503, 'llm', true], [400, 'llm', false], [404, 'llm', false]];
  for (const [status, code, retryable] of cases) {
    const { fetchFn } = fakeBedrock(status, { message: `boom ${status}` });
    const err = await new BedrockLlm({ models, region: 'us-east-1', token: 't', fetchFn }).json(opts).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ code, retryable });
    expect(err.message).toContain(`boom ${status}`);
  }
});

test('a network failure is a retryable llm error', async () => {
  const fetchFn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  await expect(new BedrockLlm({ models, region: 'us-east-1', token: 't', fetchFn }).json(opts)).rejects.toMatchObject({ code: 'llm', retryable: true });
});

test('createLlm builds Bedrock from AWS_BEARER_TOKEN_BEDROCK + AWS_REGION, and needs both', () => {
  const c = Config.parse({ provider: 'bedrock', fastModel: 'f', strongModel: 's' });
  process.env.AWS_BEARER_TOKEN_BEDROCK = 'tok';
  expect(createLlm(c)).toBeNull();
  process.env.AWS_REGION = 'us-east-1';
  expect(createLlm(c)).toBeInstanceOf(BedrockLlm);
  delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  expect(createLlm(c)).toBeNull();
});
