# Plan issues

## Open

### Step 12: order of checks in `ensureToday`
- **Unclear:** item 0 (null `llmFactory` → raw digest, `errorCode = 'auth'`) is listed before item 1 (`!config.onboarded` → do nothing), and it doesn't say whether S1–S2 still run first.
- **Options:** (a) check onboarded first, then lock / today's done digest, run S1–S2, and only then substitute the raw digest for S3–S7 when the Llm is null; (b) apply the numbered order literally.
- **Recommendation:** (a). A raw digest needs window items, so S1–S2 must run, and a non-onboarded user should never get a build.

### Step 0: one `tsconfig.json` can't both cover tests/scripts and build `dist/cli.js`
- **Conflict:** §B.1/step 0 say `build` is `tsc -p tsconfig.json` and `tsconfig.json` also covers `tests/` and `scripts/`. Emitting from that config puts the CLI at `dist/src/cli.js`, which breaks `bin: dist/cli.js`.
- **Approved by human (2026-10-29):** `tsconfig.json` covers src + tests + scripts and is used for `typecheck`; a small `tsconfig.build.json` extends it with `rootDir: src` and only `src/**/*.ts`, and `build` uses it.

### Step 3: off-by-default packs would enable nothing
- **Problem:** §B.8 says a source's `defaultEnabled` falls back to the pack's. For a pack that is off by default (YouTube), every source inherits `false`, so turning the pack on in onboarding enables zero sources.
- **Resolution (data only, no code change):** in off-by-default packs, sources that should switch on with the pack set `"defaultEnabled": true` explicitly. The pack-level flag means only "pre-checked in onboarding". The step 3 test fixture that modeled this case (pack `b`) was corrected to set it explicitly.

## Mechanical adaptations

- Step 4, `fetchRss`: reads `content` before `contentSnippet`, then runs `stripHtml`. rss-parser's `contentSnippet` keeps `<script>` text, while stripping the raw HTML removes it. The output is the same plain text otherwise.
- Step 4: `fetchWithTimeout()` lives in `src/sources/text.ts` and is shared by rss, hn and reddit. It turns timeouts and non-2xx responses into readable errors.
