import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, vi } from 'vitest';

// Key/LLM_* lookup reads ./.env; never let a test see the developer's real one.
beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'dd-cwd-')));
});
