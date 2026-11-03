import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { KEY_ENV_VARS, resolveKey, type Config, type Provider } from '../config.js';
import { AiSdkLlm } from './ai-sdk.js';
import type { Llm } from './types.js';

export const PROVIDERS = Object.keys(KEY_ENV_VARS) as Provider[];
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Looked up 2026-10-30:
// anthropic  https://platform.claude.com/docs/en/about-claude/models/overview
// openai     https://developers.openai.com/api/docs/models
// google     https://ai.google.dev/gemini-api/docs/models
// openrouter https://openrouter.ai/anthropic
// ollama     https://ollama.com/library (a commonly available local model; the UI says so)
export const SUGGESTED_MODELS: Record<Provider, { fast: string; strong: string }> = {
  anthropic: { fast: 'claude-haiku-5-5', strong: 'claude-sonnet-5-5' },
  openai: { fast: 'gpt-6-luna', strong: 'gpt-6.1-sol' },
  google: { fast: 'gemini-3.5-flash-lite', strong: 'gemini-3.8-flash' },
  openrouter: { fast: 'anthropic/claude-haiku-5.5', strong: 'anthropic/claude-sonnet-5.5' },
  ollama: { fast: 'qwen3:8b', strong: 'qwen3:8b' },
};

function modelFactory(provider: Provider, apiKey: string | undefined, baseUrl: string | undefined): (id: string) => LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey });
    case 'openai':
      return createOpenAI({ apiKey });
    case 'google':
      return createGoogle({ apiKey });
    case 'openrouter':
      return createOpenAICompatible({ name: 'openrouter', baseURL: OPENROUTER_BASE_URL, apiKey, supportsStructuredOutputs: true });
    case 'ollama':
      return createOpenAICompatible({ name: 'ollama', baseURL: baseUrl || OLLAMA_DEFAULT_BASE_URL, supportsStructuredOutputs: true });
  }
}

/** Builds the real Llm from the current config, or null when provider, models or a required key are missing. */
export function createLlm(config: Config): Llm | null {
  const { provider, fastModel, strongModel } = config;
  if (!provider || !fastModel || !strongModel) return null;
  const { key } = resolveKey(config);
  if (KEY_ENV_VARS[provider] && !key) return null;
  const model = modelFactory(provider, key, config.baseUrl);
  return new AiSdkLlm({ fast: model(fastModel), strong: model(strongModel) }, undefined, config.effort);
}
