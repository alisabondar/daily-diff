import { afterEach, expect, test } from 'vitest';
import { z } from 'zod';
import { Config } from '../src/config.js';
import { AiSdkLlm, type ModelCall } from '../src/llm/ai-sdk.js';
import { FakeLlm } from '../src/llm/fake.js';
import { createLlm } from '../src/llm/providers.js';
import { withRetry } from '../src/llm/retry.js';
import { LlmError } from '../src/llm/types.js';

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const schema = z.object({ ok: z.literal(true) });
const opts = { tier: 'fast' as const, task: 'ping' as const, system: 's', prompt: 'p', schema };
const noDelay = [0, 0];

test('withRetry succeeds on the 3rd attempt', async () => {
  let n = 0;
  const out = await withRetry(async () => {
    n++;
    if (n < 3) throw new LlmError('flaky', 'llm', true);
    return 'done';
  }, noDelay);
  expect(out).toBe('done');
  expect(n).toBe(3);
});

test('withRetry gives up after 3 attempts', async () => {
  let n = 0;
  await expect(withRetry(async () => { n++; throw new LlmError('down', 'llm', true); }, noDelay)).rejects.toThrow('down');
  expect(n).toBe(3);
});

test('withRetry never retries a non-retryable error', async () => {
  let n = 0;
  await expect(withRetry(async () => { n++; throw new LlmError('bad key', 'auth', false); }, noDelay)).rejects.toMatchObject({ code: 'auth' });
  expect(n).toBe(1);
});

test('FakeLlm returns validated data, fixed usage, and records calls', async () => {
  const fake = new FakeLlm({ ping: () => ({ ok: true }) });
  expect(await fake.json(opts)).toEqual({ data: { ok: true }, usage: { inputTokens: 10, outputTokens: 5 } });
  expect(fake.calls).toEqual([{ task: 'ping', tier: 'fast', system: 's', prompt: 'p' }]);
});

test('FakeLlm throws on schema-invalid data', async () => {
  await expect(new FakeLlm({ ping: () => ({ ok: false }) }).json(opts)).rejects.toBeInstanceOf(LlmError);
});

test('FakeLlm throws a returned Error, and throws when a task has no handler', async () => {
  const err = new LlmError('nope', 'auth', false);
  await expect(new FakeLlm({ ping: () => err }).json(opts)).rejects.toBe(err);
  await expect(new FakeLlm({}).json(opts)).rejects.toThrow(/no handler/i);
});

const defaults = Config.parse({});

test('createLlm returns null without provider, models or key', () => {
  expect(createLlm(defaults)).toBeNull();
  expect(createLlm({ ...defaults, provider: 'anthropic', fastModel: 'f', strongModel: 's' })).toBeNull();
  expect(createLlm({ ...defaults, provider: 'anthropic', fastModel: 'f', apiKey: 'k' })).toBeNull();
});

test('createLlm builds with an env key, a config key, or no key for ollama', () => {
  const base = { ...defaults, fastModel: 'f', strongModel: 's' };
  process.env.ANTHROPIC_API_KEY = 'env-key';
  expect(createLlm({ ...base, provider: 'anthropic' })).not.toBeNull();
  expect(createLlm({ ...base, provider: 'openai', apiKey: 'k' })).not.toBeNull();
  expect(createLlm({ ...base, provider: 'ollama' })).not.toBeNull();
});

const models = { fast: 'fast-model' as never, strong: 'strong-model' as never };
const throwing = (e: unknown): ModelCall => async () => { throw e; };

test('ai-sdk: 401/402/403 map to non-retryable auth errors', async () => {
  for (const statusCode of [401, 402, 403]) {
    await expect(new AiSdkLlm(models, throwing({ statusCode, message: 'denied' })).json(opts)).rejects.toMatchObject({ code: 'auth', retryable: false });
  }
});

test('ai-sdk: 500 and other failures map to retryable llm errors', async () => {
  await expect(new AiSdkLlm(models, throwing({ statusCode: 500, message: 'boom' })).json(opts)).rejects.toMatchObject({ code: 'llm', retryable: true, message: 'boom' });
  await expect(new AiSdkLlm(models, throwing(new Error('socket hang up'))).json(opts)).rejects.toMatchObject({ code: 'llm', retryable: true });
});

test('ai-sdk: picks the tier model, validates output and reports usage', async () => {
  const seen: unknown[] = [];
  const call: ModelCall = async ({ model }) => {
    seen.push(model);
    return { output: { ok: true }, usage: { inputTokens: 7, outputTokens: 3 } };
  };
  const llm = new AiSdkLlm(models, call);
  expect(await llm.json({ ...opts, tier: 'strong' })).toEqual({ data: { ok: true }, usage: { inputTokens: 7, outputTokens: 3 } });
  expect(seen).toEqual(['strong-model']);
  await expect(new AiSdkLlm(models, async () => ({ output: { ok: 1 }, usage: {} })).json(opts)).rejects.toMatchObject({ code: 'llm' });
});
