# Plan issues

## Open

### Change (2026-11-10): demo GIF for the README
- **Requested by human:** a Playwright script that records the app and converts the recording for the README.
- **Dependencies:** Playwright, `gifenc` and `jpeg-js` aren't in §B.2, so they are **not** project dependencies. `scripts/record-demo.mjs` loads them from a scratch folder named by `DEMO_DEPS` (setup in the script header). `package.json` is unchanged. There's no `ffmpeg` on the machine, so frames come from Chrome's screencast (CDP) and are encoded to GIF in JS with one shared palette.
- **Output:** `docs/demo.gif`: 800×500, Chrome screencast frames with real timing, capped at about 15 fps, 30 s, 8.3 MB (under GitHub's 10 MB image limit). Recorded from the human's real digest of 2026-11-10. It saves a story with a tag, scrolls to the end of Today, opens and reads through Learn, then shows Archive search, Favorites and Sources. The favorite it creates is removed afterwards, in a `finally` block. Settings is left out because it shows the profile and key-file path.

### Change (2026-11-10): every working pack source on; Prompt Armor replaced
- **Requested by human:** "do not have sources automatically off if they dont work, find what works and replace them".
- **Change from Part D:** Prompt Armor, which still has no feed, is replaced by Embrace The Red (`https://embracethered.com/blog/index.xml`; prompt-injection and AI-agent security research; verified live on 2026-11-10: 200, 233 items, latest 2026-10-13). The Security pack is now on by default. Every source in the Podcasts and Security packs is on whenever its pack is on, instead of Part D's "rest off".
- **Unchanged:** the YouTube pack stays off in onboarding, because without `YOUTUBE_API_KEY` its RSS feeds fail often. Its sources switch on when the pack is turned on.

### Change (2026-11-10): one combined Reddit feed in the Community pack
- **Requested by human:** "let's delete it because theyre useless and wont work on any machine - are there other threads we can use for successful fetches?"
- **Finding:** Reddit allows about one unauthenticated feed request per IP and then answers 429 to everything for a while, whichever subreddit it is. With r/programming fetched first it returned 200, and r/LocalLLaMA got the 429. Swapping in other subreddits wouldn't help.
- **Change:** the three Reddit sources in Part D's Community pack are replaced by one combined feed, `https://www.reddit.com/r/LocalLLaMA+MachineLearning+programming/top/.rss?t=day`, which makes one request. It was verified live on 2026-11-10: 200, 25 entries (19 LocalLLaMA, 5 programming, 1 MachineLearning).
- **Note:** `seedSources` only upserts, so the old rows stay in existing databases. The human's own database was cleaned by hand. S5's Reddit comment fetches are still best-effort and can 429.

### Change (2026-11-09): YouTube Data API when `YOUTUBE_API_KEY` is set
- **Why:** YouTube's RSS endpoint is failing intermittently (see the entry below). The YouTube Data API v3 is the supported route.
- **Approved by human (2026-11-09):** after the hybrid was proposed, "ok so how do i add an api key now so we can test", then "ok it works!" once their key was in `.env`.
- **Design:** `src/sources/youtube-api.ts`. For each YouTube feed source (`/feeds/videos.xml?channel_id=UC…`), it calls `channels.list` (part=contentDetails) to get the uploads playlist, then `playlistItems.list` (part=snippet,contentDetails, maxResults=50). That's 2 quota units per channel per build, against a default 10,000/day (Google's "determine quota cost" page, read 2026-11-09). `search.list` isn't used.
- **The key:** read with `envValue('YOUTUBE_API_KEY')` (process env, then `./.env`, then `$DAILY_DIFF_HOME/.env`). It's sent in the `X-Goog-Api-Key` header (verified live), never in a URL, so it can't reach error messages or logs. It's never written to config.json and never sent to the browser.
- **Fallback:** with no key, the RSS path and the retry lane are unchanged.
- **Rule 7:** adds `www.googleapis.com` to the outbound host list.

### Real run (2026-11-09): every YouTube feed returns 404
- **Problem:** in a real catch-up build from `~/.daily-diff`, all 7 YouTube channels failed: six with HTTP 404, Fireship with 500. The channel IDs are still correct (`@anthropic-ai` → `externalId` `UCrDwWp7EBBv4NwvScIpBDOA`), but `https://www.youtube.com/feeds/videos.xml?channel_id=…` returns 404 on repeated requests, with or without a browser User-Agent, and so does the `playlist_id=UU…` form. It looks like a change or outage on YouTube's side; it worked on 2026-11-03 (`src/packs/VERIFY.md`).
- **Re-probe (same evening):** it's intermittent, not dead. One pass over the 7 IDs gave 200 for 2 channels, 500 for 1 and 404 for 4. Seconds later the channel that had returned 200 returned 404 six times in a row. The 404 body comes from `server: YouTube RSS Feeds server`, so the endpoint is degraded on YouTube's side.
- **Options:** (a) wait and re-check; it may be transient. (a2) give YouTube feeds a Reddit-style retry: a short gap, a couple of retries on 404/500, and sequential fetches. (b) turn the YouTube pack off by default until the feeds return. (c) find another official feed route. No alternative has been verified, and the plan forbids guessing URLs.
- **Decided by human (2026-11-09):** (a2). YouTube feeds are fetched one at a time with a 1s gap, and a 404/5xx is retried twice after 3s (`s1-fetch.ts`, 3 new tests in `ingest.test.ts`). In a live run of S1 on a copy of the real DB, 3 of 7 channels came back (none did before), and S1 took 31.6s. The rest still fail on bad days; they show in the banner.

### Change (2026-11-03): topic categories and the "calm" Today redesign (from /fmk)
- **Requested and approved by human (2026-11-03):** "you didn't categorize the articles at all", then a 6-round /fmk ending with design G "calm". Log: `.scratch/fmk/fmk-log.md`.
- **Topics (backend):** new enum `TOPICS = ai | dev-tools | security | infra | industry | research | other` and a nullable `stories.topic` column (migration 0002). S4 returns a `topic` per story in the same batched call (no extra LLM calls). Missing → `other`; raw digests → `other`. Stories in the API also carry `topic` and `readMinutes` (item text at 230 wpm, minimum 1).
- **Today (UI):** replaces step 16's Highlights/More tabs with one page:
  - a masthead with story count and total minutes;
  - a numbered top 3 (the first three Highlights in compose order), each with a summary and margin notes (topic, read time, source);
  - "More by topic": every other story from both tabs, grouped by topic;
  - the collapsed Learn box and a sign-off.
  The palette is sage paper with Optima (system stack: Optima → Candara → system sans; Optima can't be bundled for licensing reasons), with a dark variant via `prefers-color-scheme`. Highlight sections and the cap still drive what makes the top 3.

### Step 24 audit fix (2026-11-03): YouTube discovery used the wrong channel, and the pack was empty
- **Problem:** step 14 scans a `@handle` page for `"channelId"`, but on live pages that key appears only for *related* channels. @Fireship resolved to "Beyond Fireship" and @ThePrimeagen to "The PrimeTime", and five other channels resolved to nothing. The page's own id is `"externalId"`, which matches the canonical `/channel/UC…` link. Because of this, step 3 shipped the YouTube pack empty.
- **Fix:** discovery prefers `"externalId"`, then the canonical link, then `"channelId"` as before. There's a new test with a fixture that contains related channels. The YouTube pack now has the 7 channels from Part D, verified live (see `src/packs/VERIFY.md`), with `defaultEnabled: true` per source so enabling the pack switches them on.

### Step 23: notes on the measurements and the setup check
- **Pricing source:** the Bedrock pricing page renders its model tables client-side, and WebFetch couldn't read the Sonnet 5.5 row. The README computes cost from Anthropic's published list price ($2/$10 per MTok, platform.claude.com/docs/en/about-claude/pricing, read 2026-11-03) plus the 10% regional-endpoint premium that page documents for Bedrock. It says so and links the Bedrock page. **Human: please confirm against the Bedrock console/pricing for us-east-1.**
- **Builds were measured as configured:** Sonnet 5.5 for both tiers, because the human's `.env` sets only `LLM_MODEL`. A Haiku fast tier wasn't measured, and the README doesn't claim a number for it.
- **Fresh-clone check:** `git clone` worked, and with this repo's `node_modules` linked (the registry is blocked, so `npm ci` couldn't run) `typecheck`, `test` (203) and `build` passed. `npm ci` and `npx daily-diff` from a clean machine remain for the human.
- **Reddit:** even with sequential fetching, a retry and a User-Agent, r/MachineLearning and r/programming returned 429 on all three builds (r/LocalLLaMA succeeded). Reddit is best-effort per the plan; the failures show in the "sources failed" banner.

### Step 22: `docker build`/`docker run` not verified by the agent
- **Problem:** the sandbox denies access to the Docker socket (`permission denied … docker.sock`), so the Dockerfile is written but not built. The `node:22-slim` tag was confirmed active on Docker Hub (2026-11-03). `npx ./daily-diff-*.tgz` also can't run, because the npm registry is blocked. Instead, the packed tarball was unpacked with this repo's dependencies and served from an empty home on `--port 4300`.
- **Needed:** the human runs the README's `docker build` + `docker run -p 127.0.0.1:4242:4242 …` and opens http://127.0.0.1:4242.
- **Additions:** `StartupOpts.inDocker`/`onListening` (testability; "running" prints only once the server is listening), and a friendly EADDRINUSE message. `.dockerignore` keeps `.env` out of the image.

### Change (2026-11-03): shorter Highlights and paced Reddit fetches
- **Approved by human (2026-11-03).** The goal is a ~10-minute read. The human's first real build hit Reddit 429s on 2 of the 3 subreddit feeds.
- **Length:** the default `highlightsCap` goes from 10 to 6 (§B.6; the 4–20 range is unchanged, so a saved config.json keeps its value) and the catch-up cap from 15 to 8 (step 11). The summarize prompt asks for "1–2 plain sentences" and "at most 2" pros/cons, and `guardSummary` cuts pros/cons to 2.
- **Reddit (S1):** sources on `reddit.com` are fetched one at a time with a 2s gap, alongside the concurrency-8 pool for the rest. A 429 is retried once after 5s. RSS requests to Reddit send `User-Agent: daily-diff/<version>`. `IngestDeps` gains an injected `sleep`.
- **Tests changed because the spec changed:** the step 11 and step 12 catch-up cap tests (15 → 8). New tests cover the pros/cons cap of 2, the prompt wording, the default cap of 6, and the Reddit pacing and retry.

### Change (2026-11-03): collapsed Learn and a section bar on Today
- **Requested by human (2026-11-03):** Learn Something New starts collapsed (a native `<details>` showing the concept title) and expands on click. Both tabs get a row of section chips with story counts that scroll to each section; Highlights also has a Learn chip. They scroll with `scrollIntoView` instead of `#anchors`, because the hash is the router's. This amends step 16's layout only, with no API change.

### Change (2026-11-03): Bedrock through a direct `fetch` to the Converse API
- **Approved by human (2026-11-03):** no `@ai-sdk/amazon-bedrock`. `src/llm/bedrock.ts` implements the `Llm` interface with the injected `fetchFn`, so no dependency is added. It replaces the earlier Bedrock options (a) and (c).
- **Verified in the AWS docs on 2026-11-03:**
  - Converse API reference: `POST /model/{modelId}/converse`; `system[]`, `messages[]`, `inferenceConfig.maxTokens`; response `output.message.content[].text`, `stopReason`, `usage.inputTokens/outputTokens`; errors 400/403/404/408/424/429/500/503.
  - Bedrock API keys: `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK`; host `bedrock-runtime.<region>.amazonaws.com`.
  - Structured outputs: `outputConfig.textFormat = { type: 'json_schema', structure: { jsonSchema: { schema: <JSON string>, name } } }`. Every object needs `additionalProperties: false`; there are no `minimum/maximum/multipleOf/minLength/maxLength`, and `minItems` can only be 0 or 1. The first use of a schema can take ~90s to compile, so the client timeout is 120s.
  - Model cards for Claude Sonnet 5.5 and Haiku 5.5: `us.anthropic.claude-sonnet-5-5` and `us.anthropic.claude-haiku-5-5` work from us-east-1, both support Converse and structured outputs, and effort is `low|medium|high|xhigh|max`.
- **Design:**
  - Provider `bedrock`. The key variable is `AWS_BEARER_TOKEN_BEDROCK`, and `AWS_REGION` is also required (same env/.env lookup).
  - The Zod schema goes through `z.toJSONSchema`, and a sanitizer strips the unsupported keywords and sets `additionalProperties: false`. Zod still validates the response, so dropped constraints are still enforced.
  - Effort is sent as `additionalModelRequestFields.output_config.effort`, only for `low|medium|high|xhigh|max`. **Not documented for Converse; to be confirmed with the live call.**
  - Suggested models: fast `us.anthropic.claude-haiku-5-5`, strong `us.anthropic.claude-sonnet-5-5`.
  - Error mapping: 401/403 → auth (not retryable); 408/424/429/5xx and unparseable output → llm (retryable); other 4xx → llm (not retryable).
- **Rule 7:** `bedrock-runtime.<region>.amazonaws.com` joins the outbound destinations as "the configured LLM provider".

### Change (2026-11-03): `./.env`, `LLM_*` overrides and `LLM_EFFORT`
- **Requested and approved by human (2026-11-03):** the human keeps `.env` in the repo folder (`Projects/daily-diff/.env`) with `LLM_PROVIDER`, `LLM_MODEL`, `LLM_EFFORT`, the key and the region. Answers: env overrides the app, and effort is passed to the model.
- **Lookup order for any variable:** real environment, then `./.env` in the working directory, then `$DAILY_DIFF_HOME/.env`. Each lookup re-reads the files.
- **Overrides:** `LLM_PROVIDER` → `provider`; `LLM_MODEL` → `strongModel` and `fastModel`; `LLM_FAST_MODEL` (optional) → `fastModel`; `LLM_EFFORT` → `effort`. These win over config.json. Settings shows the overridden fields as read-only ("set in .env"). Invalid values are ignored and listed in Settings.
- **Effort:** a new `Config.effort` (`provider-default|none|minimal|low|medium|high|xhigh|max`, the `reasoning` call option of `ai` v7, checked in `node_modules/@ai-sdk/provider` types) is passed as `generateText({ reasoning })` on every call. It can only be set through env, and `PUT /api/settings` rejects it.
- **Still blocked:** `LLM_PROVIDER=bedrock` with `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION` needs `@ai-sdk/amazon-bedrock`, and npm is blocked in this sandbox. Until it's installed, `bedrock` shows as an unsupported `LLM_PROVIDER` value.

### Change (2026-11-03): API keys only from the environment or `$DAILY_DIFF_HOME/.env`
- **Requested and approved by human (2026-11-03):** remove in-app key entry. Keys come from real env vars, or from a `.env` file in the data directory (`~/.daily-diff/.env` by default). Real env vars win over the file.
- **Changes the plan:** §B.6 drops `apiKey` from config.json; step 13's `PUT /api/settings` no longer accepts `apiKey` (it now returns 400) and `POST /api/settings/test` no longer takes one; `keySource` becomes `env | file | none`; and `providers[]` reports each provider's `keySource` instead of `envKeyPresent`. Steps 20/21 show "Using key from $VAR" (env), "Using $VAR from <path>" (file), or the line to add to the file, with no key input. `GET /api/settings` also returns `envFile` (the path).
- **How:** `resolveKey` re-reads the file on each lookup with Node's built-in `util.parseEnv`, so no dependency is added, and adding a key takes effect without a restart. `engines.node` goes to `>=20.12` (`util.parseEnv` was added in v20.12.0/v21.7.0). A legacy `apiKey` left in config.json is ignored and dropped on the next save.
- **Tests changed because the spec changed:** the config, api, llm and pipeline tests that set `apiKey` in config now supply the key through env or `.env`. `pipeline.test.ts` now uses a temp `DAILY_DIFF_HOME`, so key resolution never reads the real `~/.daily-diff/.env`.

### Request (2026-11-03): add Amazon Bedrock as a provider
- **Conflict:** the plan has five providers (§B.6 `provider` enum) and its dependency allowlist (§B.2) doesn't include `@ai-sdk/amazon-bedrock`. Bedrock also doesn't use the single `apiKey` model: it authenticates with AWS credentials (access key ID + secret + optional session token, or the default AWS credential chain/profile) plus a region. Rule 7's list of outbound destinations would gain `bedrock-runtime.<region>.amazonaws.com`.
- **Options:** (a) add `@ai-sdk/amazon-bedrock` and use the AWS credential chain from the environment only (`AWS_REGION`, `AWS_PROFILE`/access keys). The UI shows "Using AWS credentials from environment", and no secrets are stored in config.json. (b) also store an access key ID/secret in config.json, which adds two secrets to the redaction and write-only rules. (c) reach Bedrock through OpenRouter or another OpenAI-compatible gateway, with no new dependency.
- **Recommendation:** (a). It's the smallest change, keeps every secret out of config.json, and matches how AWS users already authenticate. Model IDs come from the live Bedrock docs.
- **Approved by human (2026-11-03):** (a), credentials from the environment only.

### Request (2026-11-03): an animated loading screen while the digest builds
- **Conflict:** step 16 specifies the ProgressStrip (show `progress.message` above the latest done digest), and Phase 5 says "functional UI only… Don't add a UI kit or animation library. Visual polish is a separate later task outside this plan."
- **Options:** (a) after the plan, as part of the later polish task: a full-screen build view using CSS/Tailwind keyframes only (no library), showing the 8 stages with the current one animated and the live message, used when there's no earlier digest to show. (b) the same now, as an amendment to step 16. (c) leave the ProgressStrip as it is.
- **Recommendation:** (a) or (b). Either way it's CSS-only, so no new dependency, and the strip stays for the case where an earlier digest is visible.
- **Decided by human (2026-11-03):** (a), deferred until after step 24.

### Step 21: the real-key onboarding run hasn't been done
- **Problem:** step 21's Verify requires a manual run from an empty `DAILY_DIFF_HOME` through to a built digest with a real key. No provider key is available in this environment (no env keys, no local Ollama). Step 23 needs real builds too.
- **Done instead:** a full run from an empty home. A fake key fails Test connection (the provider returned "invalid x-api-key"), and Next stays disabled. With only the test response stubbed in the page, profile chips, Skip/Next and the pre-checked default packs all work. Finish saves the packs, completes onboarding and lands on Today with the progress strip. The real first build ran against live feeds and ended as a raw digest (auth banner, 141 items, 2 failed sources).
- **Resolved (2026-11-03):** run with the human's Bedrock key from an empty `DAILY_DIFF_HOME`. Test connection passed, Next unlocked only after it, Finish started the build with the progress strip, and the first digest finished non-raw (6 Highlights, Learn, 34 More) in 110.6s.

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

- 2026-11-03 (requested by human): `npm start` = `npm run build --silent && node dist/cli.js`, a one-command start from a clone. A Makefile was offered, but npm scripts need no extra tool and work on every OS.

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
- Step 15: the Vite dev proxy key changed from `/api` to `/api/`. The prefix `/api` also matched the module `/api.ts`, so Hono served it as the SPA's HTML and the shell never loaded.
- Step 16: the plan's `components/Markdown.tsx` and `components/markdown.ts` differ only in case. On macOS's case-insensitive filesystem, Vite resolved `./Markdown` to `markdown.ts`. Imports of the two files now use explicit `.tsx`/`.ts` extensions, and `tsconfig.web.json` sets `allowImportingTsExtensions` (it's already `noEmit`).
- Step 16: the routes validate bodies inside the handler, so `hc` doesn't type `json`. `api.ts` exports `jsonBody()`, which sends the body through `init`.
- Step 16: `parseMarkdown` keeps a link as plain text unless its href is `http(s)`. This stops `javascript:` links in model output, in line with "escape all HTML".
