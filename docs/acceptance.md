# Acceptance audit (step 24)

Audited 2026-11-03 against `docs/daily-diff-architecture.md`, section by section. Each row lists where the decision is implemented and the test or check that covers it. **Status:** ✅ implemented and covered · Δ deliberate deviation (build plan §B.0, or approved in `docs/plan-issues.md`) · 👤 manual check that's left for the human.

Test references are `file › test name` under `tests/`.

## 1. Goals

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Highlights: a short skim (models with stats and pros/cons, tools, headlines, videos) | `pipeline/s7-compose.ts`, `web/pages/Today.tsx` | `s7 › an over-cap result is truncated…`; `pipeline › happy path…`; real builds: 6 Highlights, ~1.4 min | ✅ |
| More: long reads, podcasts, videos, other | `s7-compose.ts` (`moreSectionFor`), `Today.tsx` | `s7 › non-highlight summarized stories land in More sections by score` | ✅ |
| Learn Something New: two items tied to the day | `s7-compose.ts`, `prompts/compose.ts`, `components/LearnSection.tsx` | `pipeline › happy path… 2 learn items`; `s7 › GitHub repo in the target story…` | ✅ (collapsed by default, approved) |
| Searchable archive, favorites with tags, custom sources | `routes/digests.ts`, `routes/favorites.ts`, `routes/sources.ts`, `pages/*` | `api › GET /api/search…`, `api › favorites…`, `api › sources…` | ✅ |

## 2. Product shape

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Local-first, single user, no accounts | whole app (no auth code) | `api › startup binds the server to 127.0.0.1` | ✅ |
| LLM-curated, not a plain aggregator | `pipeline/s3`–`s7` | `pipeline › happy path…` | ✅ |
| `npx daily-diff`, with Docker as a secondary option | `package.json` `bin`, `cli.ts`, `Dockerfile` | step 22: `npm pack` (70 files), packed CLI served the UI from an empty home | 👤 `npx` on a clean machine and `docker build/run` (sandbox has no registry/Docker access) |

## 3. Tech stack

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| TypeScript end to end; Hono with a typed RPC client | `server/app.ts` (`AppType`), `web/api.ts` (`hc<AppType>`) | `npm run typecheck` (server + web configs) | ✅ |
| React + Vite + Tailwind | `web/`, `vite.config.ts` | `npm run build` | ✅ |
| SQLite (better-sqlite3) + Drizzle, FTS5 | `db/schema.ts`, `drizzle/`, `db/migrate.ts` | `db › migrations apply…`, `db › FTS finds a story…` | ✅ |
| Vercel AI SDK over Anthropic/OpenAI/Google/OpenRouter/Ollama, Zod output | `llm/ai-sdk.ts`, `llm/providers.ts` | `llm › ai-sdk: …`, `llm › createLlm …` | ✅ |
| Bedrock provider | `llm/bedrock.ts` (direct Converse `fetch`, no SDK) | `bedrock › …` (9 tests); live Test connection + 3 real builds | Δ approved addition |
| Vitest, recorded fixtures, mock LLM, no key or network in tests | `tests/`, `llm/fake.ts`, `tests/fixtures/`, `tests/setup.ts` | the whole suite (206) runs offline | ✅ |
| MIT license, one npm package | `LICENSE`, `package.json` | `npm pack` | ✅ |

## 4. Configuration, keys and privacy

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Data dir `~/.daily-diff` with db, config.json, backups | `paths.ts` | `config › paths live under DAILY_DIFF_HOME and dirs exist` | ✅ |
| `config.json` written 0600 | `config.ts` `saveConfig` | `config › config file mode is 0600` | ✅ |
| Keys from env first, else saved in config.json | `config.ts` `resolveKey`/`envValue` | `config › key comes from the env var, else from $DAILY_DIFF_HOME/.env…`, `config › ./.env in the working directory wins…` | Δ approved: env or `.env` only, never config.json (`config › a legacy apiKey … is ignored and dropped`) |
| Keys never shown after entry, never sent except to the provider | `routes/settings.ts` (no key in responses), `web/` (no key input) | `api › GET /api/settings never includes the apiKey`, `invariants › the web bundle never reads env vars…` | ✅ |
| Fast and strong models; Ollama free | `llm/providers.ts`, `LlmJsonOpts.tier` | `llm › ai-sdk: picks the tier model…`, `bedrock › uses the fast model for the fast tier…` | ✅ |
| Server binds 127.0.0.1 only | `startup.ts` `bindHost` | `api › startup binds the server to 127.0.0.1`, `api › DAILY_DIFF_HOST is honored only inside Docker` | ✅ (Δ Docker exception, §B.0) |
| No telemetry; outbound only to the allowed destinations | all fetches go through injected `fetchFn` | `invariants › no outbound host outside the rule-7 list is hard-coded` | ✅ |

## 5. Sources

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| RSS/public APIs only, no scraping | `sources/rss.ts`, `sources/hn.ts`, `sources/discover.ts` | `discover › not found: a reason is returned` (no fallback to scraping) | ✅ |
| X and Apple News excluded | packs contain neither | `packs › all shipped packs load and validate…` | ✅ |
| Books are a concept pool, not feeds | `packs/books.json`, `prompts/compose.ts` | `packs › books.json is ignored by loadPacks` | ✅ |
| Custom sources: discovery (`<link>`, candidates, Substack, Medium, YouTube), 3-item preview, type pick, plain "not found" | `sources/discover.ts`, `pages/Sources.tsx` | `discover › …` (12 tests, incl. the step 24 fix `a YouTube @handle page uses its own externalId…`); manual: step 19 | ✅ |
| Source packs with verified feeds; drop feeds without an official one | `packs/*.json`, `packs/VERIFY.md`, `scripts/verify-packs.ts` | `packs › …`; VERIFY.md records drops; YouTube's 7 channels verified live in step 24 | ✅ |
| Off-by-default packs (Podcasts, YouTube, Security) | `defaultEnabled` per pack/source | `packs › setPacks enables only defaultEnabled sources` | ✅ |

## 6. When the digest builds

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| On process start and on page load, when the latest digest is older than today's local date; no cron | `startup.ts`, `POST /api/ensure`, `pipeline/run.ts`, `time.ts` | `pipeline › a done digest for today is returned without rebuilding`, `time › localDate…`, `api › POST /api/ensure…` | ✅ |
| Window: since the previous digest | `time.ts` `computeWindow`, `s2-store.ts` | `ingest › window: a normal day starts at the previous windowEnd`, `pipeline › the next day gets a new digest whose windowStart equals the previous windowEnd` | ✅ |
| Missed days → one catch-up, clamped to 7 days, with a raised cap | `time.ts`, `s7-compose.ts` `CATCHUP_CAP` | `ingest › window: a 30-day gap is clamped to 7 days`, `pipeline › a 3-day gap gives a catchup digest with a cap of 8` | Δ approved: cap 8 (was ~15) |
| Progress strip above yesterday's digest, then swap | `pipeline/progress.ts`, `components/ProgressStrip.tsx`, `Today.tsx` | `api › GET /api/status reports today, progress…`; manual: steps 16 and 21 | ✅ |

## 7. Pipeline

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Each stage persists; resume from the failed stage | `pipeline/run.ts`, `context.ts` `finishStage` | `pipeline › resume after a crash at S4 starts at S5…`, `pipeline › S1–S2 failure … the next call resumes` | ✅ |
| Re-run a single stage | `scripts/rerun-stage.ts` | dev script | Δ §B.0 (dev script, not a CLI flag) |
| S1: all feeds in parallel, 10s timeout | `s1-fetch.ts`, `sources/rss.ts` | `sources › a timeout rejects with a clear message`, `ingest › one source fails…` | ✅ (Δ approved: Reddit feeds sequential, `ingest › reddit feeds are fetched one at a time…`) |
| S2: canonical URLs, exact dedup, persist raw items | `s2-store.ts`, `sources/normalize.ts` | `ingest › same URL from a blog and HN gives one row…`, `ingest › re-running S1–S2 does not duplicate items` | ✅ |
| S3: batched grouping, no embeddings | `s3-group.ts` | `s3 › …` (4) | ✅ |
| S4: 0–10 score against the profile, category | `s4-score.ts`, `prompts/score.ts` | `s4 › …` (5) | ✅ |
| S5: HN comments (reliable), Reddit best-effort | `s5-enrich.ts`, `sources/hn.ts`, `sources/reddit.ts` | `s5 › …` (6), `sources › redditComments returns null on a 403…` | ✅ |
| S6: summaries; stats only from source text, "vendor-reported"; pros/cons from community | `s6-summarize.ts` `guardSummary`, `StoryCard.tsx` | `s6 › stats guard…`, `s6 › a stat must come from the item it cites`, `s6 › pros and cons are dropped without community text` | ✅ (Δ approved: ≤2 pros/cons, 1–2 sentences) |
| S7: compose Highlights within the cap, More, two Learn items | `s7-compose.ts` | `s7 › …` (15) | ✅ (Δ §B.0: Call A + Call B) |
| S8: save | `s8-save.ts` | `pipeline › happy path…` | ✅ |
| Feed fails → skip, with a "N sources failed" badge and details | `s1-fetch.ts`, `components/Banner.tsx` | `ingest › one source fails, one succeeds…`; manual: step 16, and the real builds (2 Reddit 429s shown) | ✅ |
| LLM fails → retry twice with backoff, then a raw digest | `llm/retry.ts`, `pipeline/raw.ts` | `llm › withRetry succeeds on the 3rd attempt`, `pipeline › an LLM error at S6 is retried, then falls back to raw` | ✅ |
| Bad key → banner linking to Settings | `run.ts` (`errorCode auth`), `Banner.tsx` | `pipeline › an auth error at S3 gives a raw digest with errorCode auth…`; manual: step 21 (fake key) | ✅ |
| Cost measured and published | `README.md` | 3 real builds (step 23) | ✅ 👤 confirm the Bedrock rate for us-east-1 (its pricing table couldn't be read) |

## 8. Digest content

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Highlights cap 8–12 | `config.ts` `highlightsCap` (4–20, default 6) | `config › Highlights default to a cap of 6` | Δ approved: default 6 for a ~10-minute read |
| Sections: Models, Tools, Headlines, Watch (≤2) | `db/schema.ts` `HIGHLIGHT_SECTIONS`, `s7-compose.ts` | `s7 › … a third watch item dropped…` | ✅ (Δ §B.0: Watch 0–2) |
| More: everything else above the threshold | `s7-compose.ts` | `s7 › non-highlight summarized stories land in More…`, `s6 › stories below the threshold are not summarized` | ✅ |
| Concept from the book pool or official docs, with a 3-question quiz | `prompts/compose.ts` (schema: 3 questions × 4 choices) | `s7 › a repeated concept triggers exactly one retry…`; manual quiz: step 16 | ✅ |
| Quick start from a README or docs | `s7-compose.ts` (README/docs fetch, `isSafePublicUrl`) | `s7 › a safe docsUrl is fetched and stripped`, `s7 › an unsafe docsUrl is not fetched`, `s7 › isSafePublicUrl(…)` | ✅ |
| No concept repeated within 30 days | `s7-compose.ts` (`learn_items ⋈ digests`) | `s7 › concepts older than 30 days are not "recent"` | Δ §B.0 (no `learn_history` table) |
| Profile injected into Score and Compose | `prompts/score.ts`, `prompts/compose.ts` | `s4 › the profile appears in the system prompt…` | ✅ |
| "Less like this" recorded, not used | `routes/favorites.ts` `/feedback` | `api › POST /api/feedback records less_like_this…` | ✅ |

## 9. Data model

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Tables: sources, items, stories, story_items, digests, digest_entries, learn_items, favorites (+tags), feedback | `db/schema.ts`, `drizzle/0000_*.sql` | `db › migrations apply to an empty DB`, `db › deleting a digest cascades…` | ✅ |
| `learn_history`, `items_fts` | derived / `stories_fts` | `db › FTS finds a story…` | Δ §B.0 |
| Archives kept forever | no deletion path for digests/items | — (absence of code) | ✅ |

## 10. UI

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Today, Archive, Favorites, Sources, Settings pages | `web/pages/*.tsx`, `App.tsx` hash router | manual: steps 15–20 | ✅ |
| Per-item open, favorite + tag, less like this | `StoryCard.tsx`, `FavoriteButton.tsx` | manual: step 16; `api › favorites…` | ✅ |
| Onboarding: provider/key (auto-detect), profile with examples, packs | `pages/Onboarding.tsx` | manual: step 21 with a real Bedrock key (first digest built on screen) | ✅ |
| Markdown rendered without raw HTML | `components/markdown.ts`, `Markdown.tsx` | `markdown › …` (11), incl. `<script>` as text | ✅ |

## 11. Versioning and upgrades

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| Migrations run automatically on startup | `startup.ts` → `runMigrations` | `api › startup binds…` (runs the startup sequence), `db › migrations apply…` | ✅ |
| Back up the DB first, keeping 5 | `db/backup.ts` | `db › backup is made on a version change`, `db › backups are pruned to the newest 5` | ✅ (Δ §B.0: on version change) |
| Semver; breaking schema changes only in majors | `package.json` 0.1.0 | process (release policy) | ✅ |

## 12. Docs

| Decision | Implemented in | Covered by | Status |
|---|---|---|---|
| README: quick start, providers, measured cost, privacy | `README.md` | step 23 | ✅ |
| Architecture doc | `docs/daily-diff-architecture.md` | — | ✅ |
| CONTRIBUTING: adding a source pack | `CONTRIBUTING.md` | step 23 | ✅ |

## 13. Scope

Every v1 item is listed above. v2 items (learned personalization, scraping, OS keychain, hosted version, desktop app, Reddit OAuth) aren't implemented, as intended. "Less like this" is recorded only.

## Rule 7 security invariants

| Invariant | Covered by |
|---|---|
| Server binds 127.0.0.1 only (Docker exception only with `/.dockerenv`) | `api › startup binds the server to 127.0.0.1`, `api › DAILY_DIFF_HOST is honored only inside Docker`; 👤 Docker: `docker run -p 127.0.0.1:4242:4242 …`, then confirm the port isn't reachable from another machine |
| Keys never in API responses | `api › GET /api/settings never includes the apiKey`, `api › GET /api/settings reports env overrides…` (no key, only the file path) |
| Keys never in error messages / stored errors | `pipeline › an auth error at S3 … key redacted`, `api › POST /api/settings/test … failures are redacted`, `config › a key from .env is redacted too` |
| Keys never in the frontend bundle | `invariants › the web bundle never reads env vars or imports server config` |
| Keys never in logs | no code path logs config or keys (the only `console` calls are in `cli.ts`: the startup URL, usage text and fatal errors); manual review in step 24 |
| No telemetry; only the allowed outbound destinations | `invariants › no outbound host outside the rule-7 list is hard-coded`; tests inject `fetchFn` throughout |
| LLM-chosen URLs must be https and public | `s7 › isSafePublicUrl(…) = …` (localhost, .local, 127/10/172.16–31/192.168/169.254, ::1, fc00::/7), `s7 › an unsafe docsUrl is not fetched` |

## Gaps

There are no implementation gaps. The one found during the audit, YouTube discovery and the empty YouTube pack, is fixed (see `docs/plan-issues.md`). Left for the human:

1. `docker build` + `docker run -p 127.0.0.1:4242:4242 …` (step 22).
2. `npm ci` and `npx daily-diff` on a clean machine (steps 22–23).
3. Confirm the Bedrock us-east-1 rate for Sonnet 5.5 against the AWS pricing page or console (README cost table).
4. Approve the deviations listed in `docs/plan-issues.md` (Part E).
