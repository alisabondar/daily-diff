# Plan issues

## Open

### Step 12: order of checks in `ensureToday` — implemented as (a)
- **Unclear:** item 0 (null `llmFactory` → raw digest, `errorCode = 'auth'`) is listed before item 1 (`!config.onboarded` → do nothing), and it doesn't say whether S1–S2 still run first.
- **Options:** (a) check onboarded first, then lock / today's done digest, run S1–S2, and only then substitute the raw digest for S3–S7 when the Llm is null; (b) apply the numbered order literally.
- **Recommendation:** (a). A raw digest needs window items, so S1–S2 must run, and a non-onboarded user should never get a build.

### Step 0: one `tsconfig.json` can't both cover tests/scripts and build `dist/cli.js`
- **Conflict:** §B.1/step 0 say `build` is `tsc -p tsconfig.json` and `tsconfig.json` also covers `tests/` and `scripts/`. Emitting from that config puts the CLI at `dist/src/cli.js`, which breaks `bin: dist/cli.js`.
- **Approved by human (2026-10-29):** `tsconfig.json` covers src + tests + scripts and is used for `typecheck`; a small `tsconfig.build.json` extends it with `rootDir: src` and only `src/**/*.ts`, and `build` uses it.

### Step 3: off-by-default packs would enable nothing
- **Problem:** §B.8 says a source's `defaultEnabled` falls back to the pack's. For a pack that is off by default (YouTube), every source inherits `false`, so turning the pack on in onboarding enables zero sources.
- **Resolution (data only, no code change):** in off-by-default packs, sources that should switch on with the pack set `"defaultEnabled": true` explicitly. The pack-level flag means only "pre-checked in onboarding". The step 3 test fixture that modeled this case (pack `b`) was corrected to set it explicitly.

### Step 5: window bounds overlap at the edge
- **Conflict:** the plan defines `windowItems` as `fetchedAt` in `[windowStart, windowEnd]` (both ends inclusive) but also requires that "an item appears in exactly one digest". S2 stamps `fetchedAt = now` and sets `windowEnd = now` in the same step, and the next digest's `windowStart` equals that `windowEnd`. Every item fetched by a build therefore sits exactly on the boundary and would show up in two digests.
- **Approved by human (2026-10-30):** `windowItems` uses `(windowStart, windowEnd]`, which excludes the start and includes the end. This is the only change, and it keeps the plan's exactly-once rule.
- **Alternative:** keep the inclusive bounds and start the next window 1 ms later. This has the same effect but is less direct.

### Step 5: shared `mapLimit`
- **Approved by human (2026-10-30).** `src/pipeline/concurrency.ts` (a new 15-line file, not in the plan's layout) holds `mapLimit()`. S1 uses it for concurrency 8, and S5 and S6 will need it too.

## Mechanical adaptations

- Step 4, `fetchRss`: reads `content` before `contentSnippet`, then runs `stripHtml`. rss-parser's `contentSnippet` keeps `<script>` text, while stripping the raw HTML removes it. The output is the same plain text otherwise.
- Step 4: `fetchWithTimeout()` lives in `src/sources/text.ts` and is shared by rss, hn and reddit. It turns timeouts and non-2xx responses into readable errors.
- Step 6: `generateObject` is deprecated in `ai` v7 ("Use `generateText` with an `output` setting instead"). `ai-sdk.ts` calls `generateText({ output: Output.object({ schema }), maxRetries: 0 })`, with the same behavior. `maxRetries: 0` leaves retries to `withRetry`.
- Step 6: `@ai-sdk/google` v4 exports `createGoogle`, which `providers.ts` uses.
- Step 7: `src/pipeline/context.ts` (not in the plan's layout) is shared by S3–S7, like `mapLimit`. It holds `StageCtx` and three helpers: `callLlm` (withRetry plus usage totals), `newUsage`, and `finishStage` (adds usage to the digest and sets `stage` inside the stage's transaction, per step 12).
- Step 9: `src/version.ts` (not in the plan's layout) reads the version from `package.json` in one place. It's used for the Reddit `User-Agent` and the CLI, and will be used by `backupIfUpgrading` at startup.
- Step 12: `run.ts` also exports `startToday(deps)`, which returns `{ started, digestDate, done }` right away. `ensureToday` is `startToday` plus `await done`. Step 13's `POST /api/ensure` needs `started` before the build finishes.
- Step 12: `redactKey(message, config)` in `config.ts` applies rule 7 to every error message stored on a digest.
- Step 13: `paths()` treats an empty `DAILY_DIFF_HOME` the same as an unset one (`||` instead of `??`). Before this fix, `DAILY_DIFF_HOME=` put the data files in the current directory.
- Step 13: `src/server/deps.ts`, `validate.ts` and `stories.ts` are small server helpers (the deps type, Zod body/param parsing that returns a 400, and the story JSON shape) shared by `routes/*.ts`.
- Step 13: the smoke test now runs `cli.ts --version`, because the CLI starts the server by default. Step 0 said the version-only CLI was "for now".
