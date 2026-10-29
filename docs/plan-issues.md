# Plan issues

## Open

### Step 12: order of checks in `ensureToday`
- **Unclear:** item 0 (null `llmFactory` → raw digest, `errorCode = 'auth'`) is listed before item 1 (`!config.onboarded` → do nothing), and it doesn't say whether S1–S2 still run first.
- **Options:** (a) check onboarded first, then lock / today's done digest, run S1–S2, and only then substitute the raw digest for S3–S7 when the Llm is null; (b) apply the numbered order literally.
- **Recommendation:** (a). A raw digest needs window items, so S1–S2 must run, and a non-onboarded user should never get a build.

### Step 0: one `tsconfig.json` can't both cover tests/scripts and build `dist/cli.js`
- **Conflict:** §B.1/step 0 say `build` is `tsc -p tsconfig.json` and `tsconfig.json` also covers `tests/` and `scripts/`. Emitting from that config puts the CLI at `dist/src/cli.js`, which breaks `bin: dist/cli.js`.
- **Done (pending approval):** `tsconfig.json` covers src + tests + scripts and is used for `typecheck`; a small `tsconfig.build.json` extends it with `rootDir: src` and only `src/**/*.ts`, and `build` uses it.

## Mechanical adaptations

(none yet)
