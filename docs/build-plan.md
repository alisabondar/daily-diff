# Daily Diff — Build Plan

This is the implementation contract for the coding agent. **`docs/daily-diff-architecture.md` explains *why*; this file specifies *exactly what* to build and in what order.** Where the two differ, this file wins. Any intentional difference is marked **[Δ]** with a reason.

---

## Part A — Rules of engagement

1. **Do the steps in order.** Don't start step N+1 until every **Verify** item in step N passes. Each step gets one commit: `step N: <title>`. For steps marked **[TDD]**, follow rule 9.
2. **Always-green baseline.** After every step, `npm run typecheck` and `npm test` must pass, plus any step-specific checks.
3. **Use only the dependencies in §B.2.** If you think you need another package, stop and ask the human.
4. **Build nothing the plan doesn't ask for.** That means no extra features, config options, abstractions, logging frameworks, UI libraries, or "nice to haves".
5. **When the plan is wrong or ambiguous, stop.** Write the issue to `docs/plan-issues.md` (the step, what's unclear, the options, and your recommendation), then ask the human. Don't guess.
   - *The one exception:* if an installed library's API differs from what the plan names (a renamed function, say) and the behavior stays identical, adapt it and log a one-line note in `docs/plan-issues.md` under "Mechanical adaptations".
6. **Look up facts.** Model IDs, feed URLs, and library APIs come from current official docs or live checks. Never write them from memory.
7. **Security invariants, which must never be broken:**
   - The server binds to `127.0.0.1` only.
   - API keys never appear in API responses, logs, error messages, or the frontend bundle.
   - No telemetry and no analytics. The only outbound network calls are to configured feeds, `hn.algolia.com`, `reddit.com` (best-effort), URLs the user pastes into feed discovery (step 14, including YouTube channel pages), GitHub READMEs/docs pages for quick starts (step 11), and the configured LLM provider.
   - Any URL chosen by the LLM (`docsUrl`) must be `https:`, and its host must not be `localhost`, `*.local`, a loopback address, or a private or link-local IP literal (`127.*`, `10.*`, `172.16–31.*`, `192.168.*`, `169.254.*`, `::1`, `fc00::/7`). Implement this as `isSafePublicUrl()` in `src/sources/text.ts`.
   - Before any error message is stored or returned, replace every occurrence of the active API key with `[redacted]`.
8. **Testability conventions, used everywhere:**
   - Anything that touches the network takes an injected `fetchFn: typeof fetch` parameter, defaulting to global `fetch`. Tests pass fakes and never hit the network.
   - Anything that calls an LLM goes through the `Llm` interface (§B.5). Tests use `FakeLlm`.
   - Anything that needs "now" takes an injected `now: () => Date`.
   - The data directory comes from `DAILY_DIFF_HOME` (default `~/.daily-diff`). Each test uses a fresh temp dir.

9. **Test-driven development for the backend.** This applies to every step marked **[TDD]**: steps 1–14, plus the `markdown.ts` parser in step 16. The rest of the UI (steps 15–21) and the packaging in step 22 rely on manual checks and are **not** TDD.
   1. **Stub.** Create the step's modules, exporting the signatures from the spec, with bodies that `throw new Error('not implemented')`. That way the tests compile and fail for the right reason. If a fixture or test helper is needed, write it now as well.
   2. **Red.** Write every test listed under **Tests (write first)**. Run `npm test`. Each new test must **fail on an assertion or on the `not implemented` error**. Failing because of a compile error, a bad import, or a typo doesn't count; fix the test and run again. If a new test passes before the implementation exists, it's testing nothing: rewrite it.
   3. **Green.** Write the **minimum** code that makes the tests pass, following the step's **Spec**. Don't add behavior that no test or spec line requires.
   4. **Refactor.** Clean up names and duplication while keeping everything green. Then run the full baseline (`npm run typecheck && npm test`) and the step's other **Verify** items.
   5. **Prove it.** In the step report and the commit body, list the new tests and give a one-line summary of the red run (for example, "red: 9 failed / 0 passed, all on assertions or not-implemented"), then the green run.
   - **Spec lines without a listed test.** If a spec line in a [TDD] step describes behavior that no listed test covers, write a test for it as well during the red phase. The listed tests are the minimum, not the whole set. This isn't scope creep: it tests behavior the spec already requires. It doesn't permit adding new behavior.

---

## Part B — Fixed contracts

### B.0 Deliberate deviations from the architecture doc [Δ]

| Architecture says | This plan does | Why |
|---|---|---|
| `learn_history` table | Derived from `learn_items ⋈ digests` | Fully derivable, so one less table to keep in sync |
| `items_fts` over items and stories | `stories_fts` over stories only | The UI only displays and favorites stories |
| Favorites on "item/story" | Favorites on stories only | Stories are the unit the UI displays |
| Digest kind "daily / catch-up / raw" | `kind: daily\|catchup` plus `isRaw` boolean | A catch-up digest can also be raw, so these are two separate attributes |
| "Always back up" before migrations | Back up whenever the app version changes | Migrations only ship with new versions, so this covers every migration without copying the DB on every launch |
| "One composition pass" with the strong model | Call A (plus at most 1 retry) and Call B | The quick start has to be written from fetched docs, which requires a second call |
| "Watch: 1–2 items" | `watch` holds 0–2 items | Some days have no relevant video |
| Re-run any single stage | `scripts/rerun-stage.ts` (dev script, step 12), not a CLI flag | Prompt tuning is a developer task, so the user-facing CLI stays minimal |
| Localhost-only binding | Docker exception via `DAILY_DIFF_HOST` (step 22) | A container can't port-map a loopback-bound server |

### B.1 Runtime and project shape

- Node **≥ 20**. ESM only (`"type": "module"`). TypeScript `strict: true`.
- One npm package called `daily-diff`, MIT license, with `bin: { "daily-diff": "dist/cli.js" }`.
- The server is compiled with `tsc` to `dist/`. The web app is built with Vite to `dist/web/`, and the server serves it as static files.
- Default port is **4242**, overridable with `--port <n>`. On start the CLI prints `Daily Diff running at http://127.0.0.1:<port>`. It does not open a browser.

### B.2 Dependency allowlist

Install the current stable versions and commit the lockfile.

| Runtime | Purpose |
|---|---|
| `hono`, `@hono/node-server` | HTTP server and static file serving |
| `better-sqlite3`, `drizzle-orm` | Database |
| `rss-parser` | RSS and Atom parsing, including podcast enclosures and YouTube Atom |
| `zod` | Schemas for LLM output and API input |
| `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` | LLM providers. OpenRouter and Ollama both go through `openai-compatible` |
| `react`, `react-dom` | Web UI |

| Dev | Purpose |
|---|---|
| `typescript`, `tsx`, `vitest`, `drizzle-kit` | Build, run, test, migrations |
| `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite` | Web build and styling |
| `@types/node`, `@types/better-sqlite3`, `@types/react`, `@types/react-dom` | Types |

Not allowed: a router library, UI component kits, state libraries, HTML parsers, date libraries, loggers, or `open`.

### B.3 Directory layout

```
daily-diff/
  CLAUDE.md
  package.json  tsconfig.json  tsconfig.web.json  vite.config.ts  vitest.config.ts  drizzle.config.ts
  Dockerfile  README.md  CONTRIBUTING.md  LICENSE
  drizzle/                     # generated SQL migrations (committed)
  docs/daily-diff-architecture.md  docs/build-plan.md  docs/plan-issues.md  docs/acceptance.md
  scripts/verify-packs.ts  scripts/dev.mjs  scripts/seed-demo.ts  scripts/rerun-stage.ts
  src/
    cli.ts                     # entry: parse args → startup → serve
    startup.ts                 # dirs, backup, migrate, config, server, ensureToday
    paths.ts                   # DAILY_DIFF_HOME resolution
    config.ts                  # load/save config.json (0600)
    time.ts                    # localDate(now), window math
    db/
      schema.ts  client.ts  migrate.ts  backup.ts  fts.sql
    packs/
      ai-news.json  tools.json  headlines.json  engineering.json
      community.json  podcasts.json  youtube.json  security.json
      books.json               # concept pool (not feeds; excluded from loadPacks)
      index.ts                 # load + validate packs, seed sources
      VERIFY.md
    sources/
      normalize.ts             # canonicalUrl()
      rss.ts                   # fetchRss()
      hn.ts                    # fetchHn(), hnComments(), hnSearchByUrl()
      reddit.ts                # redditComments() best-effort
      discover.ts              # discoverFeed()
      text.ts                  # stripHtml(), truncate()
    llm/
      types.ts                 # Llm interface, LlmError
      ai-sdk.ts                # real implementation
      fake.ts                  # FakeLlm for tests
      retry.ts
      providers.ts             # provider → model factory, env var names
    pipeline/
      run.ts                   # orchestrator: ensureToday(), resume, lock, fallback
      progress.ts              # in-memory progress state
      s1-fetch.ts  s2-store.ts  s3-group.ts  s4-score.ts
      s5-enrich.ts s6-summarize.ts s7-compose.ts s8-save.ts
      raw.ts                   # raw-digest fallback
    prompts/
      group.ts score.ts summarize.ts compose.ts quickstart.ts
    server/
      app.ts                   # Hono app, exports type AppType
      routes/*.ts
    web/
      index.html  main.tsx  App.tsx  api.ts  styles.css
      pages/Today.tsx Archive.tsx Favorites.tsx Sources.tsx Settings.tsx Onboarding.tsx
      components/StoryCard.tsx FavoriteButton.tsx ProgressStrip.tsx Banner.tsx LearnSection.tsx Markdown.tsx
      components/markdown.ts   # pure parseMarkdown() → AST (unit-tested)
  tests/
    fixtures/feeds/*.xml  fixtures/hn/*.json  fixtures/html/*.html
    fixtures/llm/handlers.ts   # FakeLlm handlers shared by tests and seed-demo
    *.test.ts
```

### B.4 Shared enums (`src/db/schema.ts`, exported as TS unions and Zod enums)

```ts
SourceType   = 'news' | 'podcast' | 'video' | 'blog' | 'community'
SourceKind   = 'rss' | 'hn'
Category     = 'model' | 'tool' | 'headline' | 'video' | 'long-read' | 'podcast'
HighlightSection = 'models' | 'tools' | 'headlines' | 'watch'
MoreSection  = 'long-reads' | 'podcasts' | 'videos' | 'other'
DigestKind   = 'daily' | 'catchup'
DigestStatus = 'running' | 'done' | 'failed'
LearnType    = 'concept' | 'quickstart'
ErrorCode    = 'auth' | 'llm' | 'unknown'
```

**Category → section mapping:**

- Highlights may only contain `model→models`, `tool→tools`, `headline→headlines`, and `video→watch`.
- More uses `long-read→long-reads`, `podcast→podcasts`, and `video→videos`. Everything else goes to `other`.

### B.5 LLM interface (`src/llm/types.ts`)

```ts
export interface LlmUsage { inputTokens: number; outputTokens: number }
export interface Llm {
  /** Returns schema-validated JSON. Throws LlmError. */
  json<T>(opts: {
    tier: 'fast' | 'strong';
    task: 'group' | 'score' | 'summarize' | 'compose' | 'quickstart' | 'ping';
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<{ data: T; usage: LlmUsage }>;
}
export class LlmError extends Error { code: 'auth' | 'llm'; retryable: boolean }
```

- `ai-sdk.ts` implements this with the AI SDK's structured-output function, `generateObject` or whatever the installed major version names it (the exception in rule 5 applies). It maps HTTP 401, 402 and 403 to `code:'auth', retryable:false`. Every other failure becomes `code:'llm', retryable:true`.
- `retry.ts`: `withRetry(fn)` makes up to **3 attempts** total (the first try plus 2 retries) with 1s and 4s delays. It never retries when `retryable:false`. Delays are injectable so tests run instantly.
- `fake.ts`: `new FakeLlm(handlers: Partial<Record<task, (prompt) => unknown | Error>>)` returns `handler(prompt)`, validated through the schema. It throws if a task has no handler. It records calls in `fake.calls`. Every successful call returns the fixed usage `{ inputTokens: 10, outputTokens: 5 }`.
- `createLlm(config): Llm | null` builds the real implementation from config. It returns null if the provider or models aren't set, or if no key is available for a provider that needs one. Callers build the Llm **per build or per request** from the current config, never once at startup, so settings changes apply immediately.
- `providers.ts`:

| provider | package | key env var | notes |
|---|---|---|---|
| `anthropic` | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` | |
| `openai` | `@ai-sdk/openai` | `OPENAI_API_KEY` | |
| `google` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` | |
| `openrouter` | `@ai-sdk/openai-compatible` | `OPENROUTER_API_KEY` | baseURL `https://openrouter.ai/api/v1` |
| `ollama` | `@ai-sdk/openai-compatible` | none | baseURL from config, default `http://localhost:11434/v1` |

Key resolution order: the env var first, then `config.apiKey`. `keySource` is reported as `'env' | 'config' | 'none'`.
Also export `SUGGESTED_MODELS: Record<provider, { fast: string; strong: string }>`. **Fill these in from each provider's current docs at build time, and cite the doc URL in a comment.** For ollama, suggest a commonly available local model and say so in the UI.

### B.6 Config (`~/.daily-diff/config.json`, written with mode `0o600`)

```ts
const Config = z.object({
  onboarded: z.boolean().default(false),
  provider: z.enum(['anthropic','openai','google','openrouter','ollama']).optional(),
  fastModel: z.string().optional(),
  strongModel: z.string().optional(),
  apiKey: z.string().optional(),          // only if not from env
  baseUrl: z.string().optional(),         // ollama only
  profile: z.string().default(''),
  highlightsCap: z.number().int().min(4).max(20).default(10),
  relevanceThreshold: z.number().int().min(0).max(10).default(5),
  lastRunVersion: z.string().optional(),
});
```

A missing or invalid file falls back to the defaults. Invalid files are renamed to `config.json.bad-<timestamp>` and are never silently overwritten.

### B.7 Database schema (`src/db/schema.ts`, Drizzle sqlite-core)

Timestamps are integer milliseconds. Booleans are integers in `{mode:'boolean'}`. JSON columns are text in `{mode:'json'}`. **Every foreign key is `ON DELETE CASCADE`** (step 12 relies on this).

```
sources        id pk · kind SourceKind · type SourceType · title text · url text · feedUrl text UNIQUE
               · hnTags text null (kind=hn: 'front_page' | 'show_hn') · pack text null (null=custom)
               · enabled bool default true · lastFetchedAt int null · lastStatus 'ok'|'error' null
               · lastError text null · createdAt int
items          id pk · sourceId fk→sources · url text UNIQUE (canonical) · title text · author text null
               · excerpt text (≤1000 chars, plain text) · content text (≤6000 chars, plain text)
               · mediaUrl text null · discussionUrl text null · hnId int null
               · publishedAt int (fallback fetchedAt) · fetchedAt int
digests        id pk · date text UNIQUE ('YYYY-MM-DD' local) · kind DigestKind · windowStart int · windowEnd int
               · status DigestStatus · stage int default 0 (last completed stage, 0–8)
               · isRaw bool default false · errorCode ErrorCode null · errorMessage text null
               · failedSourceIds json number[] default [] · inputTokens int default 0
               · outputTokens int default 0 · durationMs int null · createdAt int · completedAt int null
stories        id pk · digestId fk · title text · category Category null · score int null
               · summary text null · stats json {label,value,sourceUrl}[] null
               · pros json string[] null · cons json string[] null · community text null
story_items    storyId fk · itemId fk · PK(storyId,itemId)
digest_entries digestId fk · storyId fk · tab 'highlights'|'more' · section text · position int
               · PK(digestId,storyId)
learn_items    id pk · digestId fk · type LearnType · conceptKey text null (concept only, kebab-case)
               · title text · bodyMd text · quiz json {q,choices[4],answerIndex}[] null
               · relatedStoryId fk null · sourceRef text (book title or URL)
favorites      storyId pk fk · createdAt int
favorite_tags  storyId fk · tag text (lowercase, trimmed, 1–32 chars) · PK(storyId,tag)
feedback       id pk · storyId fk · kind 'less_like_this' · createdAt int
```

**[Δ] There is no `learn_history` table.** The 30-day no-repeat check queries `learn_items ⋈ digests`, since the history is fully derivable from them.

**Full-text search (`src/db/fts.sql`, appended as a custom drizzle-kit migration):** create `stories_fts` as an FTS5 table over `title`, `summary`, with `content='stories', content_rowid='id'`, plus insert, update and delete triggers that keep it in sync. Search covers stories, which are the units the UI shows.

### B.8 Pack file format (`src/packs/*.json`, validated with Zod at load)

```json
{ "id": "ai-news", "name": "AI News", "emoji": "🧠", "defaultEnabled": true,
  "sources": [
    { "title": "Simon Willison", "url": "https://simonwillison.net", "feedUrl": "...",
      "kind": "rss", "type": "blog", "defaultEnabled": true }
  ] }
```

A source's `defaultEnabled` falls back to the pack's value when it's omitted. For `kind:"hn"`, `feedUrl` is a synthetic unique key such as `hn:front_page`, and `hnTags` is required.

`books.json` uses `[{ "title", "author", "concepts": ["kebab-key: short description", ...] }]`. It's a hand-written pool of well-known concepts per book, about 15 to 25 each. It holds concept *names* only and never book text.

---

## Part C — Steps

Every step lists **Files**, **Spec** and **Verify**. Steps marked **[TDD]** also list **Tests (write first)** above the Spec, in the order you do the work (rule 9). Every test runs with no network access and no API key.

### Phase 1 — Foundation

#### Step 0 — Scaffold
**Files:** `package.json`, `tsconfig.json`, `tsconfig.web.json`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `LICENSE` (MIT), `.gitignore`, `scripts/dev.mjs`, `src/cli.ts` (prints the version only, for now), placeholder `src/web/index.html` and `src/web/main.tsx` (renders "Daily Diff"), `tests/smoke.test.ts`.
**Spec:**
- Scripts: `dev` (`node scripts/dev.mjs`, which uses `child_process.spawn` to run `tsx watch src/cli.ts` and `vite` together with prefixed output, kills both on exit, and has Vite proxy `/api` to 4242), `build` (`tsc -p tsconfig.json && vite build`), `typecheck` (`tsc --noEmit` for both tsconfigs), `test` (`vitest run`), `db:generate` (`drizzle-kit generate`).
- `package.json` `files` is `["dist", "drizzle"]`. A `postbuild` script (inline `node -e`, or `scripts/copy-packs.mjs`) copies `src/packs/*.json` to `dist/packs/`. At runtime, packs load from `dist/packs` relative to the compiled module.
- `tsconfig.json` covers `src/**/*.ts` (excluding `src/web`), `tests/**/*.ts` and `scripts/**/*.ts`. `tsconfig.web.json` covers `src/web/**/*`. Tests import only `.ts` modules (for example `components/markdown.ts`), never `.tsx`.
- Vite root is `src/web` and outputs to `dist/web`.

**Verify:** `npm install && npm run typecheck && npm test && npm run build` succeeds, and `node dist/cli.js` prints the version.

#### Step 1 — Paths, time, config [TDD]
**Files:** `src/paths.ts`, `src/time.ts`, `src/config.ts`, `tests/config.test.ts`, `tests/time.test.ts`.
**Tests (write first):** default config when the file is missing; save then load round-trips; file mode is 0600 (skip on Windows); an invalid file is renamed `.bad-*` and defaults are returned; an env key wins over a config key; `localDate` returns the correct date near midnight for a fixed TZ (`process.env.TZ` set in the test).
**Spec:**
- `paths()` returns `{ home, db, config, backups }` under `DAILY_DIFF_HOME ?? ~/.daily-diff` and creates the directories.
- `localDate(d: Date): string` returns `YYYY-MM-DD` in the system timezone.
- `loadConfig()` and `saveConfig(partial)` follow §B.6 and merge on save. The file mode must be `0o600`.
- `resolveKey(config)` returns `{ key?: string, source: 'env'|'config'|'none' }` using the env var table in §B.5.

**Verify:** baseline.

#### Step 2 — Database, migrations, FTS, backup [TDD]
**Files:** `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/backup.ts`, `src/db/fts.sql`, `drizzle/*`, `tests/db.test.ts`.
**Tests (write first):** migrations apply to an empty DB; FTS returns a story by a summary word after insert and stops returning it after delete; a backup is made on a version change, skipped when the version is unchanged, and pruned to 5; inserting an item with a duplicate `url` violates the unique constraint.
**Spec:**
- Schema exactly as in §B.7. Generate the migration with drizzle-kit, then add the FTS migration as a custom migration.
- `openDb(path)` turns on WAL and `foreign_keys = ON`.
- `backupIfUpgrading(paths, currentVersion, config)`: if the DB file exists and `config.lastRunVersion !== currentVersion`, copy the DB to `backups/daily-diff-<lastRunVersion|unknown>-<timestamp>.db` and keep only the newest 5 backups. Return the backup path or null. **Then** run migrations, then save `lastRunVersion`.

**Verify:** baseline.

#### Step 3 — Source packs [TDD]
**Files:** `src/packs/*.json`, `src/packs/index.ts`, `scripts/verify-packs.ts`, `src/packs/VERIFY.md`, `tests/packs.test.ts`.
**Tests (write first):** all packs load and validate; `books.json` is ignored by `loadPacks`; no duplicate feedUrls; seeding twice gives the same row count; a re-seed keeps a manually toggled `enabled`; `setPacks` enables only `defaultEnabled` sources; calling `setPacks` again with the same list leaves per-source toggles alone.
**Spec:**
- Write the packs from the table in §D. `loadPacks()` reads every `src/packs/*.json` **except `books.json`** and validates each one per §B.8. Duplicate `feedUrl`s across packs are an error.
- `seedSources(db)` upserts every pack source keyed by `feedUrl`. On **insert** it sets `enabled = false`. On **update** it refreshes `title`, `url`, `type`, `kind`, `hnTags` and `pack` but **never touches `enabled`**. It's idempotent and never touches custom sources (`pack = null`). Startup calls it on every launch, so new pack sources appear after upgrades.
- `setPacks(db, enabledPackIds)` acts only on packs whose state changes. When a pack changes from disabled to enabled (no source in it enabled → in the list), it enables that pack's sources that have `defaultEnabled`. When a pack changes from enabled to disabled, it disables all of that pack's sources. Packs whose state doesn't change are left alone, so per-source toggles survive.
- `scripts/verify-packs.ts` (**not TDD**: a manual network script run with `npx tsx`): fetches every rss `feedUrl` with a 10s timeout and parses it with `rss-parser`, then prints a table of OK, FAIL and item count. **The agent must run it.** Fix or remove failing feeds, finding the correct official feed URL where one exists, and record the results in `src/packs/VERIFY.md` with the date. Fill in every `FIND` entry from §D or remove it, logging the removal in VERIFY.md.

**Verify:** baseline, plus `npx tsx scripts/verify-packs.ts` shows every remaining feed as OK. Paste its output into VERIFY.md.

### Phase 2 — Ingestion (pipeline stages 1–2)

#### Step 4 — Normalization and fetchers [TDD]
**Files:** `src/sources/normalize.ts`, `text.ts`, `rss.ts`, `hn.ts`, `reddit.ts`, plus fixtures and tests.
**Tests (write first, from fixtures):** an RSS 2.0 blog, an Atom blog, a podcast feed with an enclosure, a YouTube Atom feed, and a Reddit RSS feed all map correctly; the `since` filter works; a timeout produces a rejected promise with a clear message; HN JSON fixtures parse; `canonicalUrl` gets a table of 10 or more cases; `stripHtml` handles entities and scripts; `redditComments` returns null on a 403.
**Spec:**
- `canonicalUrl(u)` lowercases the host, strips `www.`, drops the fragment, removes the `utm_*`, `ref`, `ref_src`, `source`, `fbclid`, `gclid` and `mc_*` query params, sorts the remaining params, removes a trailing `/` except on the root, and forces `https` when the input is `http`.
- `stripHtml(s)` uses regex. It removes tags and script/style blocks, decodes the common entities (`&amp; &lt; &gt; &quot; &#39; &nbsp;` and numeric ones), and collapses whitespace. `truncate(s, n)` cuts on a word boundary and adds `…`.
- `fetchRss(source, since, { fetchFn, timeoutMs=10000 })` returns `RawItem[]`. It maps `link`, `title`, `creator|author`, `contentSnippet|content|summary` (stripped, then truncated to excerpt 1000 and content 6000), `enclosure.url` into `mediaUrl`, and `isoDate|pubDate` into `publishedAt`. It keeps only items with `publishedAt >= since − 48h` or no date. The 48h grace catches feeds that publish late; already-seen URLs are deduplicated in S2. For Reddit feeds it sets `discussionUrl` to the item link.
- `fetchHn(source, since, opts)` calls `GET https://hn.algolia.com/api/v1/search_by_date?tags=<hnTags>&numericFilters=<encodeURIComponent("created_at_i>=<since/1000>,points>=50")>&hitsPerPage=100`. Build the query with `URLSearchParams`. For each hit: `url = hit.url ?? item page`, `discussionUrl = https://news.ycombinator.com/item?id=<objectID>`, `hnId = objectID`.
- `hnComments(hnId, opts)` calls `GET https://hn.algolia.com/api/v1/items/<id>` and takes the first 20 top-level comment texts, stripped, joined with `\n---\n`, truncated to 4000.
- `hnSearchByUrl(url, opts)` calls `GET .../search?query=<url>&restrictSearchableAttributes=url&hitsPerPage=1` and returns the hnId or null.
- `redditComments(permalinkUrl, opts)` calls `GET <url>.json?limit=20&sort=top` with header `User-Agent: daily-diff/<version>` and a 5s timeout. It takes the top-level comment bodies, truncated to 4000 total. It **never throws**: any failure returns null.

**Verify:** baseline.

#### Step 5 — Stages 1–2 and window math [TDD]
**Files:** `src/time.ts` (extend), `src/pipeline/s1-fetch.ts`, `s2-store.ts`, `tests/ingest.test.ts`.
**Tests (write first):** the window logic covers the first run, a normal day, a 3-day gap (catchup), and a 30-day gap (clamped to 7d). With two fixture sources where one fails, there's one success and one failure, `failedSourceIds` is set, and items are stored. Ingesting the same URL from a blog and from HN gives one row whose `discussionUrl` is set. Re-running S1–S2 doesn't duplicate anything. An item already ingested in yesterday's window doesn't appear in today's `windowItems`. Re-running S1 resets `failedSourceIds`.
**Spec:**
- `computeWindow(lastDone: {windowEnd} | null, now)` returns `{ windowStart, windowEnd: now, kind }`. `windowStart` is `lastDone?.windowEnd ?? now − 24h`, clamped so it's no earlier than `now − 7d`. `kind = 'catchup'` if `now − windowStart > 36h`, otherwise `'daily'`.
- **S1** first resets `digest.failedSourceIds = []`, then fetches all enabled sources with concurrency 8 and gives each one a timeout. For each source it updates `lastFetchedAt`, `lastStatus`, `lastError` (the message only), and adds failures to `digest.failedSourceIds`. It returns all `RawItem`s.
- **S2** canonicalizes URLs and inserts items with `ON CONFLICT(url) DO UPDATE SET discussionUrl = COALESCE(items.discussionUrl, excluded.discussionUrl), hnId = COALESCE(items.hnId, excluded.hnId)`. That way the first source wins, but HN and Reddit discussion links are kept.
- S1 and S2 always run together. Both are idempotent, so after a crash in either one, re-run both. Afterwards set `windowEnd = now()` and `stage = 2`.
- **Window membership is "first seen".** `windowItems(db, digest)` returns the items with `fetchedAt` in `[windowStart, windowEnd]`. S2 never updates `fetchedAt` on conflict, so an item appears in exactly one digest, even when it shows up in a feed late.

**Verify:** baseline.

### Phase 3 — LLM and curation (stages 3–8)

#### Step 6 — LLM layer [TDD]
**Files:** `src/llm/*.ts`, `tests/llm.test.ts`.
**Tests (write first):** retry succeeds on the 3rd attempt; an auth error isn't retried; FakeLlm validates against the schema and throws on invalid data; provider factory key resolution; `ai-sdk.ts` error mapping, unit-tested by passing a fake model call function that throws objects with `statusCode` 401 and 500.
**Spec:** exactly §B.5. Each stage adds the usage from its calls to `digests.inputTokens` and `outputTokens` **inside the same transaction that writes its output** (step 12), so totals survive a resume.
**Verify:** baseline.

#### Step 7 — S3 group into stories [TDD]
**Files:** `src/prompts/group.ts`, `src/pipeline/s3-group.ts`, `tests/s3.test.ts`.
**Tests (write first):** with FakeLlm returning a grouping that has a missing id, a duplicate, and an unknown id, the post-validation produces the right stories; 1,200 items produce 3 calls.
**Spec:**
- The input lines are `<itemId> | <source title> | <title> | <excerpt first 200 chars>`, chunked into batches of at most **500** items. Each chunk is its own call; duplicates across chunks are accepted.
- The schema is `{ stories: { title: string; itemIds: number[] }[] }`.
- Prompt rules: group items that report the *same event or release*; don't group items that are only on the same topic; `title` is a neutral headline of 12 words or fewer; every id appears exactly once.
- Post-validation in code: unknown ids are dropped; an id assigned twice keeps its first assignment; any missing id becomes a single-item story titled with the item's title; empty stories are dropped.
- This stage writes `stories` and `story_items`, then `stage = 3`. The fast tier is used.

**Verify:** baseline.

#### Step 8 — S4 score and categorize [TDD]
**Files:** `src/prompts/score.ts`, `src/pipeline/s4-score.ts`, `tests/s4.test.ts`.
**Tests (write first):** missing stories get defaults; clamping works; the profile text appears in the system prompt.
**Spec:**
- Batches of 50 stories. Input per story: `id`, `title`, source types, and the first item's excerpt (300 chars). The user's `profile` goes in the system prompt.
- Schema: `{ scores: { storyId: number; score: number /*0-10 int*/; category: Category }[] }`.
- Prompt rules: score relevance to the profile (with an empty profile, score general importance to a software engineer interested in AI); `model` is only for new or updated AI model releases; anything from a `video` source is `video` unless it's a model release; anything from a `podcast` source is `podcast`.
- Post-validation: stories that are missing get `score = 0` and a category derived from the source type (news→headline, blog→long-read, podcast→podcast, video→video, community→headline). Scores are clamped to 0–10.
- Fast tier, then `stage = 4`.

**Verify:** baseline.

#### Step 9 — S5 enrich with community reaction [TDD]
**Files:** `src/pipeline/s5-enrich.ts`, `tests/s5.test.ts`.
**Tests (write first):** HN path; search-by-URL path; Reddit returning null is tolerated; non-targets are untouched.
**Spec:**
- Targets are every `model` story plus the top 15 other stories by score with `score >= relevanceThreshold`.
- For each target: if any item has an `hnId`, use `hnComments`. Otherwise, for `model` stories only, try `hnSearchByUrl` on the first item's URL and use that. If any item has a Reddit `discussionUrl`, append `redditComments`, which is best-effort.
- Store the joined text, at most 6000 chars, in `stories.community`. Use concurrency 4. Network failures never fail the stage. No LLM is used. Then `stage = 5`.

**Verify:** baseline.

#### Step 10 — S6 summarize, with the stats guard [TDD]
**Files:** `src/prompts/summarize.ts`, `src/pipeline/s6-summarize.ts`, `tests/s6.test.ts`.
**Tests (write first):** a hallucinated stat is dropped and a real one kept; pros are dropped without community text; non-model stories have null stats; stories below the threshold aren't summarized.
**Spec:**
- Targets are stories with `score >= relevanceThreshold`. One call per story, concurrency 5, fast tier.
- Input: the story title, each item's (source title, url, content), with total item content capped at 6000 chars, plus `community` if present.
- Schema: `{ summary: string; stats?: {label,value,sourceUrl}[]; pros?: string[]; cons?: string[] }`.
- Prompt rules: `summary` is 2–3 plain sentences covering what happened and why it matters; it doesn't hype or repeat the headline. **Model stories only:** `stats` may include only numbers that literally appear in the provided source text, with the `sourceUrl` of the item they came from; `pros` and `cons` (at most 3 each) must come **only** from `community` text, and are omitted when there's no community text.
- **Stats guard, enforced in code:** drop any stat whose `value` (whitespace-normalized) isn't a substring of the referenced item's `content`, or whose `sourceUrl` isn't one of the story's item URLs. Drop `pros` and `cons` when `community` is empty. Non-model stories have stats, pros and cons forced to null.
- The UI labels stats "vendor-reported". Then `stage = 6`.

**Verify:** baseline.

#### Step 11 — S7 compose Highlights and Learn [TDD]
**Files:** `src/prompts/compose.ts`, `src/prompts/quickstart.ts`, `src/pipeline/s7-compose.ts`, `src/packs/books.json`, `tests/s7.test.ts`.
**Tests (write first):** an over-cap result is truncated; a third `watch` item is dropped; a wrong-section pair is dropped; a repeated concept triggers exactly one retry; a GitHub README URL is derived correctly; a failed docs fetch sets the warning prefix; non-highlight stories land in the right More sections; zero summarized stories gives no LLM calls and no learn items; an invalid target `storyId` falls back to the best `tool` story; an unsafe `docsUrl` (`http://127.0.0.1/…`) isn't fetched.
**Spec:**
- **Call A (strong).** Input: the summarized stories (`id`, `title`, `category`, `score`, `summary`), the profile, `cap` (`highlightsCap`, or 15 when `kind = 'catchup'`), the concept keys used in the last 30 days, and the book pool from `books.json`.
  - Schema: `{ highlights: { storyId:number; section: HighlightSection }[]; concept: { conceptKey: string; title: string; bodyMd: string; quiz: {q:string; choices:string[4]; answerIndex:0|1|2|3}[3]; relatedStoryId:number; sourceRef:string }; quickstartTarget: { storyId:number; name:string; docsUrl:string|null } }`.
  - Prompt rules for highlights: choose the most important and relevant stories; respect the section mapping in §B.4; put at most 2 in `watch`; order within a section by importance.
  - Prompt rules for the concept: pick one or two themes from today's top stories and choose a concept those stories depend on. Prefer a concept from the book pool when it really fits, with `sourceRef` set to the book title; otherwise use a well-established concept with `sourceRef` set to an official docs URL. Never quote book text. Don't reuse a recent concept key. `bodyMd` is at most 200 words. The quiz has 3 questions with 4 choices each.
  - Prompt rules for `quickstartTarget`: pick a tool, SDK or API mentioned in today's stories that a reader could try in about 5 minutes.
- **Code validation for Call A:** drop highlight ids that don't exist or aren't summarized, and drop wrong section/category pairs (§B.4); truncate to `cap`, and `watch` to 2. If `conceptKey` is in the recent list, retry Call A **once** with an added instruction listing the forbidden keys, then accept the result whatever it is. `relatedStoryId` must exist, or it's set to null.
- **Edge cases for Call A:**
  - If there are **zero summarized stories**, skip Call A and Call B entirely. Write no entries and no learn items. The UI shows "Quiet day — nothing above your relevance threshold" (step 16).
  - If `quickstartTarget.storyId` isn't a summarized story, replace it with the highest-scoring `tool` story, or failing that the highest-scoring story overall, and set `docsUrl = null`.
- **Docs fetch (choose the first rule that applies):**
  1. If the target story's items contain a `github.com/<owner>/<repo>` URL, fetch `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/README.md`.
  2. Otherwise, if `docsUrl` is non-null and `isSafePublicUrl(docsUrl)`, fetch it and run `stripHtml`.
  3. Otherwise, don't fetch.

  Use a 10s timeout and truncate to 8000 chars. If nothing was fetched or the fetch failed, use the target story's item content and set `docsUnavailable = true`.
- **Call B (strong, task `quickstart`).** Input: the target, the fetched docs text, and the flag. Schema: `{ title: string; bodyMd: string; sourceRef: string }`. Rules: steps must come from the provided docs text; include install and first-use commands; keep it to about 5 minutes and at most 250 words; if `docsUnavailable`, start with "⚠️ Steps inferred from announcement — check the official docs."
- **Write** these in one transaction (see stage idempotency in step 12): `digest_entries`, where highlights come from Call A in order. Every other summarized story goes to `more`, with its section from the §B.4 mapping, ordered by score descending. Write two `learn_items`: the concept, plus the quick start with `relatedStoryId` set to the target `storyId`. Then `stage = 7`.

**Verify:** baseline.

#### Step 12 — S8, orchestrator, raw fallback [TDD]
**Files:** `src/pipeline/s8-save.ts`, `run.ts`, `raw.ts`, `progress.ts`, `tests/pipeline.test.ts`.
**Tests (write first; integration, fixtures plus FakeLlm with all handlers):**
- a full happy path produces a done digest with highlights ≤ cap, 2 learn items, and nonzero token totals;
- an auth error at S3 gives a raw digest with `errorCode = 'auth'`, and the auth error isn't retried;
- an LLM error at S6 is retried, then falls back to raw;
- resume after a crash: run a build through S4, then simulate the crash by setting the digest row to `status = 'running', stage = 4` directly in the DB, using a fresh lock (export `__resetLockForTests()`). Calling `ensureToday` again resumes at S5, and the S3 and S4 handlers aren't called again. Add no other test hooks;
- two concurrent `ensureToday` calls give one build;
- a crash in the middle of S3 (the handler throws a non-LlmError after some stories have been inserted), followed by a rerun, leaves no duplicate stories;
- a null `llmFactory` produces a raw digest with `errorCode = 'auth'`;
- the next day gives a new digest whose `windowStart` equals the previous `windowEnd`;
- a 3-day gap gives `kind = 'catchup'` with a cap of 15.

**Spec:**
- `ensureToday(deps)` with `deps = { db, getConfig: () => Config, llmFactory: (c: Config) => Llm | null, fetchFn, now }`. It returns `Promise<{ started: boolean; digestDate: string | null }>`, where `started` is true when this call began or joined a build. It reads config and builds the Llm when the build starts.
  0. If `llmFactory` returns null (no provider or key), skip S3–S7 and produce a raw digest with `errorCode = 'auth'`.
  1. If `!config.onboarded`, do nothing.
  2. If a build is already in progress *in this process*, held by a module-level promise lock, return that promise.
  3. Let `today = localDate(now())`. If a digest for `today` has `status = 'done'`, return it.
  4. If a digest for `today` has `status = 'running'` or `'failed'`, from a crash or an earlier error, **resume** from `stage + 1` (stages 1–2 re-run together, per step 5). Otherwise create it with `computeWindow`.
  5. Run the stages in order, updating `progress` (the current stage number, a human message like `"Grouping 312 items into stories…"`, and counts).
  6. **S8:** set `status = 'done'`, `stage = 8`, `completedAt`, `durationMs`, and the token totals.
- **Fallback:** if S3–S7 throw after retries, run `buildRaw(digest)`. It deletes the partial `digest_entries`, `stories` and `learn_items` for this digest, then creates one story per window item (`title`, `summary = excerpt`, category from the source type), and writes all of them as `more` entries with sections from the mapping, newest first. It sets `isRaw = true`, `status = 'done'`, `errorCode` (`auth` for an auth LlmError, otherwise `llm`), and `errorMessage` as a short message with the key redacted per rule 7. A raw digest has no learn items, and the API returns `learn: null`.
- If S1–S2 throw (not per-source failures, which are handled), set `status = 'failed'` with `errorCode = 'unknown'`. The next `ensureToday` resumes.
- `progress.get()` returns `{ running: boolean; stage: number; message: string }`.
- **Stage idempotency.** Each stage S3–S7 runs in **one SQLite transaction**: delete this digest's prior output for that stage, write the new output, add usage to the token totals, and set `stage`. S3 deletes the digest's `stories`, which cascades. S4, S5 and S6 overwrite columns. S7 deletes `digest_entries` and `learn_items`. All FKs pointing at `stories` and `digests` are `ON DELETE CASCADE`, including `favorites`, `favorite_tags` and `feedback`.
- **`scripts/rerun-stage.ts <date> <stage>`** (dev only, run with tsx) sets that digest to `status = 'running', stage = <stage − 1>`, then calls `ensureToday`. It's for prompt tuning.
- **`scripts/seed-demo.ts`** sets `DAILY_DIFF_HOME=./.demo-home`, writes an onboarded config, seeds fixture sources, and runs the pipeline using the fixture `fetchFn` and `FakeLlm` with `tests/fixtures/llm/handlers.ts`. `npm run demo` runs it, then starts the server with the same home. Add `.demo-home` to `.gitignore`.

**Verify:** baseline.

### Phase 4 — Server

#### Step 13 — API [TDD]
**Files:** `src/server/app.ts`, `src/server/routes/*.ts`, `src/startup.ts`, `src/cli.ts`, `tests/api.test.ts`.
**Tests (write first; using `app.request()`, a temp DB and FakeLlm):** every route's happy path plus one 400; **no `apiKey` in any response body**, checked by asserting the serialized `/api/settings` response doesn't contain the test key; search finds a seeded story; deleting a pack source returns 400; `startup` binds the hostname to `127.0.0.1`, asserted through an injected `serve` fake.
**Spec:** `createApp(deps)` returns a Hono app; export `type AppType`. Validate all JSON input with Zod and return a 400 on bad input. Endpoints:

| Method & path | Behavior |
|---|---|
| `POST /api/ensure` | Calls `ensureToday` and returns its `{ started, digestDate }` as soon as that's known, without waiting for the build to finish (resolve `started` synchronously before the build promise) |
| `GET /api/status` | `{ onboarded, progress, today: {date,status,stage,isRaw,errorCode}|null, latestDoneDate, failedSources: {id,title,lastError}[] }` (from the latest digest's `failedSourceIds`) |
| `GET /api/digests?limit=60&before=YYYY-MM-DD` | `[{ date, kind, isRaw, highlightCount }]`, newest first |
| `GET /api/digests/:date` | `{ meta, highlights: {section, stories[]}[], more: {section, stories[]}[], learn: {concept, quickstart} }`. Each story has `{id,title,category,summary,stats,pros,cons,links:[{url,sourceTitle,discussionUrl,mediaUrl}],favorite:{tags}|null}` |
| `GET /api/search?q=` | FTS over stories, with the query sanitized to plain terms and prefix matching. Returns `[{story, digestDate}]`, limit 50 |
| `GET /api/favorites?tag=` | Favorited stories newest first, plus all tags with counts |
| `PUT /api/favorites/:storyId` | Body `{ tags: string[] }`. Upserts the favorite and replaces its tags |
| `DELETE /api/favorites/:storyId` | Removes the favorite |
| `POST /api/feedback` | `{ storyId, kind:'less_like_this' }`. Records only |
| `GET /api/sources` | All sources with their health fields |
| `POST /api/sources` | `{ feedUrl, title, url, type }`. Custom source, `pack = null` |
| `PATCH /api/sources/:id` | `{ enabled?, title?, type? }` |
| `DELETE /api/sources/:id` | Custom sources only. Pack sources return 400 ("disable instead") |
| `POST /api/sources/discover` | Step 14 |
| `GET /api/packs` | Packs with source counts and an enabled flag (any source in the pack enabled) |
| `POST /api/packs` | `{ enabled: string[] }`. Calls `setPacks` |
| `GET /api/settings` | Config **without `apiKey`**, plus `keySource` (for the current provider), `providers: [{ id, envVar, envKeyPresent }]`, and `suggestedModels` |
| `PUT /api/settings` | Partial config. `apiKey` is write-only. An empty string clears it |
| `POST /api/settings/test` | Body: an **unsaved** partial config (provider, fastModel, apiKey?, baseUrl?) merged over the saved config. Builds an Llm with `createLlm` and calls `json({ tier:'fast', task:'ping', schema: z.object({ ok: z.literal(true) }) })`. Returns `{ ok: true }` or `{ ok:false, code, message }`, with the key redacted |
| `POST /api/onboarding/complete` | Sets `onboarded = true` and calls `ensureToday` |
| `GET /*` | Serves `dist/web`, with SPA fallback to `index.html` |

`startup.ts` runs `paths` → `loadConfig` → `backupIfUpgrading` → migrate → `seedSources` (sources inserted disabled; onboarding enables packs through `setPacks`) → `serve({ hostname: '127.0.0.1', port })` → `ensureToday()` without awaiting it, if onboarded.

**Verify:** baseline, and `npm run build && node dist/cli.js` serves `/api/status`.

#### Step 14 — Feed discovery [TDD]
**Files:** `src/sources/discover.ts`, the `POST /api/sources/discover` route, `tests/discover.test.ts`, `tests/fixtures/html/*.html`.
**Tests (write first):** a direct feed URL; a link tag with a relative href; the candidate fallback; Substack; a YouTube channel id; the not-found case.
**Spec:** `discoverFeed(url, { fetchFn })`:
1. **URL rewrites, with no fetch needed:** `*.substack.com/...` becomes `<origin>/feed`; `medium.com/@user` becomes `https://medium.com/feed/@user`; `youtube.com/channel/<id>` becomes `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`. Then go to step 5 with the rewritten URL.
2. Fetch the URL. If the response parses as RSS or Atom, it's the feed; go to step 5. If it's a `youtube.com/@handle` page, scan it for `"channelId":"<id>"` and rewrite the URL as in step 1.
3. Otherwise scan the HTML `<head>` with regex for `<link rel="alternate" type="application/(rss|atom)+xml" href>` and resolve it relative to the page. Also treat a page with Substack markers (`substackcdn.com`) as `<origin>/feed`.
4. Otherwise try these candidates in order: `/feed`, `/rss`, `/feed.xml`, `/atom.xml`, `/index.xml`, `/rss.xml`.
5. Fetch the candidate and parse it with `rss-parser` to confirm it's a real feed and to build the preview.

It returns `{ found: true, feedUrl, title, suggestedType, preview: [{title,url,publishedAt}] (3) }` or `{ found: false, reason }`. `suggestedType` is video for YouTube, podcast if any item has an enclosure, otherwise blog. **It never scrapes article content.**

**Verify:** baseline.

### Phase 5 — Web UI

Phase 5 is functional UI only. Style it cleanly with Tailwind: readable type, generous spacing, light and dark via `prefers-color-scheme`. Don't add a UI kit or animation library. Visual polish is a separate later task outside this plan.

#### Step 15 — Shell, routing, API client
**Files:** `src/web/index.html`, `main.tsx`, `App.tsx`, `api.ts`, `styles.css`.
**Spec:**
- Use a hand-rolled hash router (about 30 lines, a `useHash` hook). Routes: `#/` (Today), `#/d/:date`, `#/archive`, `#/favorites`, `#/sources`, `#/settings`, `#/onboarding`.
- If `!status.onboarded`, redirect to onboarding.
- `api.ts` uses Hono's `hc<AppType>` client.
- The nav has Today, Archive, Favorites, Sources, Settings.
- On app load, call `POST /api/ensure`, then poll `/api/status` every 2s while `progress.running` and stop when it's done.

**Verify:** baseline, plus a manual check that `npm run dev` loads the shell and the nav works.

#### Step 16 — Today and digest view
**Files:** `pages/Today.tsx`, `components/StoryCard.tsx`, `ProgressStrip.tsx`, `Banner.tsx`, `LearnSection.tsx`, `FavoriteButton.tsx`, `Markdown.tsx`, `markdown.ts`, `tests/markdown.test.ts`.
**Spec:**
- Two tabs, **Highlights** and **More**.
- Highlights shows sections in the order 🧠 Model Releases, 🛠 Tools, 📰 Headlines, 🎬 Watch, then 📚 Learn Something New.
- More is grouped by Long reads, Podcasts, Videos, Other.
- **StoryCard:** title (linking to the first URL), summary, source chips (each linking out, with 💬 for a discussion link and 🎧 for media), a stats table captioned "vendor-reported" (models only), pros and cons lists (models only), a FavoriteButton with a tag popover (free-text tags with existing tags suggested), and a "Less like this" button that records feedback and shows "Thanks — noted".
- **LearnSection:** a concept card with `bodyMd` rendered as markdown (see the note below), `sourceRef`, and an interactive quiz (choose an answer, reveal whether it's right, with no persistence). A quick-start card shows `bodyMd` and `sourceRef`.
- **ProgressStrip:** while building, show `progress.message` above the latest done digest, then swap to today's digest when it's done.
- **Banners:**
  - `isRaw` with `errorCode = 'auth'`: "Your API key was rejected or is out of credits — fix it in Settings" (linked). The raw digest still displays.
  - `isRaw` with `errorCode = 'llm'`: "AI summaries unavailable today — showing raw feed."
  - `failedSources.length > 0`: "N sources failed" opens a list.
- If a non-raw digest has no entries, show "Quiet day — nothing above your relevance threshold."
- `#/d/:date` renders the same view for an archived date.
- **Markdown note [TDD for `markdown.ts` only, rule 9]:** no markdown library is allowed. Write the `tests/markdown.test.ts` cases first (paragraphs, each heading level, both list types, fenced code, inline code, bold, italic, links, and `<script>` escaped to text), see them fail, then implement. Write a ~60-line renderer in `components/Markdown.tsx` supporting paragraphs, `#`–`###` headings, `-` lists, `1.` lists, fenced code blocks, inline `code`, **bold**, *italic*, and links. Escape all HTML; never use `dangerouslySetInnerHTML` with raw model output. Put the pure `parseMarkdown(src) → AST` function in `components/markdown.ts`, and unit-test it in `tests/markdown.test.ts` with no DOM. `Markdown.tsx` only renders the AST.

**Verify:** baseline, plus a manual check that `npm run demo` (step 12) renders every section and the quiz. To check the banners, edit the demo DB row (`isRaw`, `errorCode`, `failedSourceIds`) and reload.

#### Step 17 — Archive and search
**Files:** `pages/Archive.tsx`.
**Spec:** a search box (debounced 250ms, calling `/api/search`) with results showing a date badge; when the box is empty, a date list (paginated with `before`) showing each date's kind and highlight count and linking to `#/d/:date`.
**Verify:** baseline, plus a manual check.

#### Step 18 — Favorites
**Files:** `pages/Favorites.tsx`.
**Spec:** a tag filter bar (All plus each tag with its count) and a list of StoryCards; un-favoriting removes a card immediately.
**Verify:** baseline, plus a manual check.

#### Step 19 — Sources
**Files:** `pages/Sources.tsx`.
**Spec:** sources grouped by pack, plus a Custom group, each with an enable toggle and a health dot (ok, error, or never fetched) with `lastError` in a tooltip. Packs have toggles. Each source has inline editing for `title` and `type` through `PATCH`, and custom sources have a delete button. **Add source:** paste a URL, call discover, show the preview of 3 items and the title, pick a type, then save. When nothing is found, show the reason with the text "No feed found — Daily Diff only supports RSS/Atom feeds."
**Verify:** baseline, plus a manual check.

#### Step 20 — Settings
**Files:** `pages/Settings.tsx`.
**Spec:**
- Provider select. Fast and strong model inputs, prefilled from `suggestedModels`. A key field that shows "Using key from $ENV_VAR" when `keySource = 'env'`; otherwise it's a password input showing "••• saved" or "not set", and it never displays the key. Base URL (ollama only).
- A **Test connection** button.
- A profile textarea with a placeholder example.
- Inputs for `highlightsCap` and `relevanceThreshold`.

**Verify:** baseline, plus a manual check.

#### Step 21 — Onboarding
**Files:** `pages/Onboarding.tsx`.
**Spec:** three steps with a stepper:
1. **Provider and key.** Auto-detect an env key and preselect that provider. *Test connection* must pass before Next is enabled.
2. **Profile.** Show three example profiles as clickable chips that fill the textarea. It can be skipped.
3. **Packs.** Checkboxes, with `defaultEnabled` packs pre-checked.

**Finish** calls `POST /api/packs`, then `POST /api/onboarding/complete`, then navigates to Today, where the progress strip shows the first build.
**Verify:** baseline, plus a manual run from an empty `DAILY_DIFF_HOME` through to a built digest with a real key.

### Phase 6 — Ship

#### Step 22 — CLI, packaging, Docker
**Files:** `src/cli.ts`, `Dockerfile`.
**Spec:**
- The CLI flags are `--port <n>`, `--version` and `--help`. Nothing else.
- Handle `SIGINT` and `SIGTERM` gracefully: stop the server and close the DB.
- **[Δ] Dockerfile:** multi-stage on `node:22-slim`. This is the only exception to localhost-only binding, and it's needed because a container can't port-map a loopback-bound server. It sets `DAILY_DIFF_HOME=/data` with `VOLUME /data` and exposes 4242. **Note:** inside Docker the server must bind `0.0.0.0` for port mapping to work, so add an env var `DAILY_DIFF_HOST`, honored *only* when `/.dockerenv` exists. The README must document running it as `docker run -p 127.0.0.1:4242:4242 …`.

**Verify:** `npm pack` produces a tarball; `DAILY_DIFF_HOME=$(mktemp -d) npx ./daily-diff-*.tgz --port 4300` starts and serves the UI; `docker build` and `docker run` work with the documented command.

#### Step 23 — Measure and document
**Files:** `README.md`, `CONTRIBUTING.md`.
**Spec:**
- Run 3 or more real builds with the default packs on at least one provider. Each build uses a fresh `DAILY_DIFF_HOME` (so each covers a 24h window), and you can run them on the same day. Record `durationMs` and the token totals from `digests`, compute the cost from the provider's published pricing (cite the URL and date), and put a small table in the README. **Don't estimate. Only publish measured numbers.**
- **README:** a 60-second quick start (`npx daily-diff`), supported providers and env vars, the measured cost and build time, the privacy statement (localhost only, no telemetry, the exact list of outbound destinations from rule 7), the data directory and backups, Docker usage, and a link to the architecture doc.
- **CONTRIBUTING:** dev setup, the test commands, and "Adding a source pack" (the JSON format from §B.8, running `verify-packs`, one pack per PR).

**Verify:** a fresh clone, followed by the README's dev-setup commands exactly as written, works. The `npx daily-diff` quick start is verified with the step-22 tarball, because the package isn't on npm yet.

#### Step 24 — Final acceptance audit
Go through `docs/daily-diff-architecture.md` section by section and check each decision against the code. Record the result in `docs/acceptance.md` as a table of decision, where it's implemented (file), and the test that covers it. Any gap goes back as a fix before release. Also confirm that every Part A rule-7 invariant has a test, or a written manual check for Docker.

---

### Phase 7 — Daily habit (added 2026-11-12 at the human's request)

#### Step 25 — Reading log and streaks [TDD]
**Files:** `src/db/schema.ts`, `drizzle/0003_reads.sql`, `src/streak.ts`, `src/server/routes/reads.ts`, `src/server/app.ts`, `tests/streak.test.ts`, `tests/api.test.ts`.
**Schema:** `reads  date text pk ('YYYY-MM-DD' local, the day the reading happened) · finishedAt int null · quizCorrect int null · quizTotal int null`.
**Spec:**
- `computeStreak(readDates: string[], today: string) → { current, best, readToday, freezeAvailable }`. A day counts when it has a `reads` row. One missed day per ISO week (Mon–Sun) is forgiven as a freeze: it keeps the streak alive but doesn't add to it. A second miss in the same week breaks the streak. Today not being read yet is not a miss. `freezeAvailable` is true when the current ISO week has no forgiven miss.
- `POST /api/reads` with body `{ kind: 'finished' }` or `{ kind: 'quiz', correct, total }` (integers, `0 ≤ correct ≤ total ≤ 10`) upserts the row for `localDate(now())`. A quiz result overwrites the previous one for that day. Returns the streak.
- `GET /api/streak` returns `computeStreak` over all `reads` dates and `localDate(now())`.
**Tests (write first):** consecutive days count; today unread keeps yesterday's streak; one missed day in a week is forgiven and not counted; two misses in one week break it; misses in different weeks are each forgiven; `best` survives a break; `freezeAvailable` flips after a forgiven miss; API: `finished` then `GET /api/streak` gives `readToday: true, current: 1`; quiz upsert overwrites; bad body returns 400.
**Verify:** baseline.

#### Step 26 — Since-you-looked, streak chip, and the quiz as a finish line
**Files:** `src/web/pages/Today.tsx`, `src/web/components/LearnSection.tsx`, `src/web/components/FinishLine.tsx`, `src/web/api.ts`.
**Spec:**
- The Today header adds "since {weekday of `meta.windowStart`}" and, when any exist, "{n} model release(s)" (stories with `category = 'model'`).
- A streak chip under the header: "🔥 {current}-day streak" (with "· read today ✓" once read), or "Start a streak today" when `current = 0`.
- Today's digest only (not archive views): when the end of the page scrolls into view, post `{ kind: 'finished' }` once.
- The quiz moves out of Learn into a "Close the diff" card above the sign-off: one question at a time, instant feedback, then a score line ("2/3 · 🔥 5-day streak"). Finishing posts `{ kind: 'quiz', correct, total }` (today's digest only). Learn keeps the concept text and links to the card.
**Verify:** manual in the browser, and baseline.

#### Step 27 — Visuals
**Files:** `src/web/components/StoryCard.tsx`, `src/web/components/SourceMark.tsx`, `src/web/components/WeekHeatmap.tsx`, `src/web/pages/Today.tsx`, `src/web/pages/Archive.tsx`.
**Spec:**
- **Stat bars:** in `ModelDetails`, stats whose value is a percentage (`/^\d+(\.\d+)?%$/`) render as labeled horizontal bars on a 0–100 scale, each linking its `sourceUrl`. Other stats stay in the table. (A comparison with the previous model is out of scope, because no data for it exists.)
- **Source mark:** a monogram (the source title's first letter in a topic-colored circle) next to the source name on top stories and story cards. No favicons, since fetching them would be an outbound call that rule 7 doesn't allow.
- **Week heatmap:** at the top of Archive, a grid of topics × the last 7 done digests. Cell intensity is the story count. Clicking a column opens that day. It's built client-side from `GET /api/digests` and `GET /api/digests/:date`, with no new endpoint.
**Verify:** manual in the browser, and baseline.

---

## Part D — Source pack contents (step 3)

`FIND` means the agent must locate the official feed URL and verify it, or remove the source and log it. Every URL listed here is a **candidate** that `verify-packs` has to confirm.

| Pack (id) | Default | Source | type | feedUrl candidate |
|---|---|---|---|---|
| ai-news | on | Simon Willison | blog | `https://simonwillison.net/atom/everything/` |
| | | Latent Space | blog | `https://www.latent.space/feed` |
| | | Import AI | blog | `https://importai.substack.com/feed` |
| | | Interconnects | blog | `https://www.interconnects.ai/feed` |
| | | One Useful Thing | blog | `https://www.oneusefulthing.org/feed` |
| | | The Batch | news | FIND |
| | | Ben's Bites | news | FIND |
| | | Hugging Face Blog | blog | `https://huggingface.co/blog/feed.xml` |
| | | OpenAI News | news | `https://openai.com/news/rss.xml` |
| | | Anthropic News | news | FIND (may not exist) |
| | | Google DeepMind | news | `https://deepmind.google/blog/rss.xml` |
| tools | on | Show HN | community | kind `hn`, hnTags `show_hn`, feedUrl `hn:show_hn` |
| | | Product Hunt | news | `https://www.producthunt.com/feed` |
| | | GitHub Blog | blog | `https://github.blog/feed/` |
| | | GitHub Changelog | news | `https://github.blog/changelog/feed/` |
| | | HF Daily Papers | news | FIND (drop if no official feed) |
| headlines | on | Ars Technica | news | `https://feeds.arstechnica.com/arstechnica/index` |
| | | The Verge | news | `https://www.theverge.com/rss/index.xml` |
| | | TechCrunch | news | `https://techcrunch.com/feed/` |
| | | Stratechery | blog | `https://stratechery.com/feed/` |
| | | TLDR Tech | news | FIND |
| engineering | on | The Pragmatic Engineer | blog | `https://newsletter.pragmaticengineer.com/feed` |
| | | Will Larson (lethain.com) | blog | `https://lethain.com/feeds/` |
| | | Martin Fowler | blog | `https://martinfowler.com/feed.atom` |
| | | ByteByteGo | blog | `https://blog.bytebytego.com/feed` |
| | | Julia Evans | blog | `https://jvns.ca/atom.xml` |
| | | Dan Luu | blog | `https://danluu.com/atom.xml` |
| | | Charity Majors | blog | `https://charity.wtf/feed/` |
| | | InfoQ | news | `https://feed.infoq.com/` |
| | | Cloudflare Blog | blog | `https://blog.cloudflare.com/rss/` |
| | | Netflix Tech Blog | blog | `https://netflixtechblog.com/feed` |
| | | Medium: AI tag | blog | `https://medium.com/feed/tag/artificial-intelligence` |
| community | on | Hacker News front page | community | kind `hn`, hnTags `front_page`, feedUrl `hn:front_page` |
| | | r/LocalLLaMA | community | `https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day` |
| | | r/MachineLearning | community | `https://www.reddit.com/r/MachineLearning/top/.rss?t=day` |
| | | r/programming | community | `https://www.reddit.com/r/programming/top/.rss?t=day` |
| podcasts | Lenny's + WSJ on, rest off | Lenny's Podcast | podcast | FIND |
| | | WSJ Tech News Briefing / Today in Tech | podcast | FIND |
| | | Latent Space podcast | podcast | FIND (skip if same feed as ai-news) |
| | | Dwarkesh Podcast | podcast | FIND |
| | | The Changelog | podcast | `https://changelog.com/podcast/feed` |
| | | Hard Fork | podcast | FIND |
| | | Software Engineering Daily | podcast | FIND |
| youtube | off | Anthropic, OpenAI, Google DeepMind, Fireship, AI Explained, Two Minute Papers, ThePrimeagen | video | `https://www.youtube.com/feeds/videos.xml?channel_id=FIND` (look up each channel ID) |
| security | Prompt Armor on, rest off | Prompt Armor | blog | FIND |
| | | Krebs on Security | news | `https://krebsonsecurity.com/feed/` |
| | | Schneier on Security | blog | `https://www.schneier.com/feed/atom/` |
| | | Simon Willison: prompt injection | blog | FIND (tag feed) |

**books.json:** *Designing Data-Intensive Applications* (Martin Kleppmann), *Staff Engineer* (Will Larson), *An Elegant Puzzle* (Will Larson). Concept keys only, for example `write-ahead-log`, `leader-follower-replication`, `consistent-hashing`, `staff-archetypes`, `engineering-strategy`.

---

## Part E — Definition of done (v1)

- Steps 0–27 are committed, with the baseline green and every manual check recorded in the step's commit message.
- `docs/acceptance.md` has no gaps.
- The README's cost and build-time numbers are measured, not estimated.
- `docs/plan-issues.md` lists every deviation and mechanical adaptation, and the human has approved each one.
