import type { Config } from '../config.js';
import type { Llm } from '../llm/types.js';
import type { EnsureDeps } from '../pipeline/run.js';

export interface AppDeps extends EnsureDeps {
  saveConfig: (partial: Partial<Config>) => Config;
  /** Builds an Llm for POST /api/settings/test (createLlm in production). */
  createLlm: (c: Config) => Llm | null;
  /** Directory with the built web app (dist/web). */
  webDir: string;
}
