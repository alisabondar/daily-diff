import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// Rule 7 guards that are about the code itself rather than runtime behavior.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
const code = (p: string) => readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// Feeds come from packs/user input; everything else is the configured LLM provider or a rule-7 destination.
const ALLOWED_HOSTS = new Set([
  'hn.algolia.com', 'news.ycombinator.com', // HN API + discussion links
  'raw.githubusercontent.com', // quick-start READMEs
  'medium.com', 'www.youtube.com', // discovery rewrites of user-pasted URLs
  'openrouter.ai', 'localhost', // providers (OpenRouter, Ollama default)
  'www.googleapis.com', // YouTube Data API v3, only when YOUTUBE_API_KEY is set
  'bedrock-runtime.${region}.amazonaws.com', // Bedrock provider
  '${hostname}', // the server's own address in the "running at" message
]);

test('no outbound host outside the rule-7 list is hard-coded (no telemetry)', () => {
  const hosts = new Set<string>();
  for (const f of files('src').filter((f) => !f.startsWith(join('src', 'packs')))) {
    for (const m of code(f).matchAll(/https?:\/\/([a-zA-Z0-9.${}-]+)/g)) hosts.add(m[1]!);
  }
  expect([...hosts].filter((h) => !ALLOWED_HOSTS.has(h))).toEqual([]);
});

test('the web bundle never reads env vars or imports server config (keys stay server-side)', () => {
  for (const f of files(join('src', 'web'))) {
    const src = code(f);
    expect(src, f).not.toMatch(/process\.env|import\.meta\.env/);
    expect(src, f).not.toMatch(/from ['"](\.\.\/)+(config|paths|llm)/);
  }
});
