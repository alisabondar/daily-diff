import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('cli prints the package version', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts'], { encoding: 'utf8' });
  expect(out.trim()).toBe(version);
});
