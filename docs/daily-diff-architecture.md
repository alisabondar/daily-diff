# Daily Diff — Architecture & Design Decisions

> A local-first daily AI & tech briefing. Run it with `npx daily-diff`, bring your own LLM key, read a 10-minute digest of what changed in tech since you last looked.

Status: design agreed, pre-implementation. Every decision below includes its rationale so future changes can be judged against the original reasoning.

---

## 1. Goals

Gather the most relevant AI and tech news since the last digest and present it as:

- **Highlights** — a ~10 minute skim: model releases (with stats and pros/cons), new tools, headlines, videos/demos.
- **More** — longer reads, podcasts, videos, and remaining relevant links.
- **Learn Something New** — two items daily, both tied to that day's content: a concept and a hands-on quick start.

Plus: a permanent searchable archive, favorites with tags, and user-added custom sources.

## 2. Product shape

| Decision | Choice | Why |
|---|---|---|
| Deployment | **Local-first, single-user** app each person runs on their own machine | Matches "works on other users' machines"; removes auth, billing, hosting, and privacy burden from v1 |
| Accounts | **None in v1** — one install = one user | Accounts belong to a future hosted version |
| First audience | The author, daily, before anyone else | Validates that Highlights really is a 10-minute read |
| Curation | **LLM-curated** (not a plain aggregator) | Pros/cons, dedup across sources, and a coherent Highlights are impossible without it |
| Distribution | **`npx daily-diff`** → local server; Dockerfile as a secondary option | Target audience already has Node; a desktop app is premature |

## 3. Tech stack

- **Language:** TypeScript end to end.
- **Server:** **Hono** on Node. Chosen over Express for TS-native types, a typed RPC client for the frontend, and runtime portability (Node/Bun/Deno/Cloudflare Workers), which keeps a hosted v2 cheap to build. Express would also work; nothing depends on Hono specifically.
- **Frontend:** React + Vite + Tailwind.
- **Database:** SQLite via `better-sqlite3` + **Drizzle** (typed schema, migrations). FTS5 for search.
- **LLM layer:** **Vercel AI SDK** (`ai`). One interface over Anthropic, OpenAI, Google, OpenRouter, and Ollama, with Zod-validated structured output.
- **Tests:** Vitest, recorded feed fixtures, and a mock LLM provider, so the whole pipeline runs in CI with no key and no network.

### Repo layout

```
daily-diff/
  src/
    pipeline/      # 8 stages, each resumable
    server/        # Hono API + static web serving
    web/           # React app
    db/            # Drizzle schema + migrations
    packs/         # source packs (JSON)
    prompts/
  docs/architecture.md
  README.md
  CONTRIBUTING.md
  Dockerfile
```

Published to npm as one package under the MIT license.

## 4. Configuration, keys, and privacy

- **Data directory:** `~/.daily-diff/` contains `daily-diff.db`, `config.json`, and `backups/`.
- **API keys:** read from environment variables first (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …). If none is found, the key entered during onboarding is saved to `config.json` with `chmod 600`. Keys are never displayed after entry and never sent anywhere except the chosen provider. OS keychain storage is deferred to v2.
- **Models:** configurable provider plus a **fast model** (per-item work) and a **strong model** (final composition). Ollama users can run it for free.
- **Network:** server binds to **`127.0.0.1` only**.
- **Telemetry:** **none.** The only outbound traffic goes to configured feeds, the HN Algolia API, Reddit (best-effort), and the chosen LLM provider.

## 5. Sources

### Rules

- **RSS / public APIs only in v1.** No HTML scraping (opt-in scraping is v2).
- **Excluded:** X (paid API, ToS forbids scraping) and Apple News (no public API).
- **Books** are not feeds. They form a **concept pool** for the Learn section. Authors with blogs (e.g. Will Larson → lethain.com) go into the feed list.
- **Custom sources:** user pastes any URL. The app auto-discovers the feed (`<link rel="alternate">`, `/feed`, `/rss`, Substack and Medium patterns), shows a 3-item preview, and the user picks a type (news / podcast / video / blog). If no feed is found, the app says so plainly and never falls back to scraping silently.

### Source packs (`src/packs/*.json`)

Every feed URL must be verified live before shipping; drop or replace any without an official feed.

| Pack | Default | Sources |
|---|---|---|
| 🧠 AI News | on | Simon Willison, Latent Space, Import AI, Interconnects, One Useful Thing, The Batch, Ben's Bites, Hugging Face Blog, OpenAI / Anthropic / Google DeepMind news |
| 🛠 Tools & Launches | on | Show HN (HN API), Product Hunt, GitHub Blog + Changelog, HF Daily Papers |
| 📰 Tech Headlines | on | Ars Technica, The Verge, TechCrunch, Stratechery (free), TLDR |
| ⚙️ Engineering | on | Pragmatic Engineer, lethain.com, Martin Fowler, ByteByteGo, Julia Evans, Dan Luu, Charity Majors, InfoQ, Cloudflare Blog, Netflix Tech Blog, Medium (tag feeds), Substack (per-publication `/feed`) |
| 🌐 Community | on | Hacker News front page, selected subreddits (`.rss`) |
| 🎧 Podcasts | Lenny's + WSJ Today in Tech on; rest opt-in | Latent Space, Dwarkesh, The Changelog, Hard Fork, Software Engineering Daily |
| 🎬 YouTube | opt-in | Anthropic, OpenAI, Google DeepMind, Fireship, AI Explained, Two Minute Papers, ThePrimeagen (channel RSS) |
| 🔐 Security | Prompt Armor on; rest opt-in | Krebs on Security, Schneier on Security, Simon Willison prompt-injection tag |

**Book concept pool:** *Designing Data-Intensive Applications*, *Staff Engineer*, and Will Larson's other writing. Learn items summarize a concept and link out; they never reproduce book text.

Target: about 35 feeds on by default and about 15 opt-in. New packs are contributed as JSON PRs.

## 6. When the digest builds

- **Trigger:** on **process start** and on **any page load**, if the latest digest's date is earlier than today's **local calendar date**. There is no scheduler and no cron. This covers both the person who launches the app each morning and the server that has been running for days.
- **Window:** everything since the previous digest.
- **Missed days:** a single **catch-up digest** covers the gap, capped at 7 days, with the Highlights cap raised to about 15. Missed days are not backfilled, because RSS feeds keep limited history and backfills would be patchy.
- **While building:** a progress strip ("Fetching 35 sources… Grouping 312 items… Writing Highlights…") shows above yesterday's digest, which stays readable. The page swaps to the new digest when it's ready.

## 7. Pipeline

Each stage writes its output to the database before the next begins. A failed run resumes from the failed stage, and any single stage can be re-run on its own (for example, tuning the Compose prompt).

| # | Stage | Model | Detail |
|---|---|---|---|
| 1 | **Fetch** | — | All feeds in parallel, 10s timeout each, items since the last digest |
| 2 | **Normalize & store** | — | Canonicalize URLs, drop exact duplicates, persist raw items |
| 3 | **Group into stories** | fast | One batched call groups titles and descriptions into stories; each story keeps all source links. No embeddings (Anthropic has no embeddings API, and requiring a second provider is unacceptable) |
| 4 | **Score & categorize** | fast | 0–10 relevance against the user profile; category ∈ {model, tool, headline, video, long-read, podcast} |
| 5 | **Enrich** | — | For model releases and top stories: HN comments via the Algolia API (reliable), Reddit comments best-effort (skipped quietly if blocked) |
| 6 | **Summarize** | fast | Summary per story above threshold. Model releases also get **stats taken only from fetched source text, labeled "vendor-reported" and linked**, plus pros/cons drawn from community reaction |
| 7 | **Compose** | strong | Picks and orders Highlights within the cap, assigns the rest to More, and generates the two Learn items (§8) |
| 8 | **Save** | — | Persist the digest and its item references |

### Failure handling

- **Feed fails:** skip it and show a badge ("2 sources failed") that links to details.
- **LLM call fails:** retry twice with backoff. If it still fails, fall back to a **raw digest** of titles, links, and excerpts grouped by category. The user never sees an empty page.
- **Bad key or no credits:** show a clear banner that links to Settings.

### Cost

Two tiers: the fast model handles high-volume per-item work and the strong model makes one composition pass. The expected cost is cents per day, but this is **unmeasured**. Measure it on real runs and publish the numbers in the README.

## 8. Digest content

### Highlights tab (cap 8–12 items; about 15 for catch-up)

Fixed sections: 🧠 Model Releases · 🛠 Tools · 📰 Headlines · 🎬 Watch (1–2 items).

### More tab

Everything else above the relevance threshold, grouped into long reads, podcasts, videos, and other links.

### 📚 Learn Something New (always two items, outside the Highlights cap)

Compose picks one or two themes from the day's top stories, then generates:

1. **Concept:** drawn from the book pool when it fits (a database outage → DDIA replication; a leadership post → *Staff Engineer*). Otherwise, any well-established concept the story depends on, linked to official docs. Includes a **3-question self-quiz**.
2. **Quick start:** for a tool, SDK, or API mentioned that day, built from its README or docs ("Your first call with the X SDK in 5 minutes").

A `learn_history` table prevents repeating a concept within 30 days.

### Personalization (v1)

A free-text **profile** in Settings (role, industry, projects, interests, things to skip) is injected into the Score and Compose prompts. "Less like this" clicks are **recorded but not used** in v1. They are training data for v2.

## 9. Data model (Drizzle / SQLite)

| Table | Purpose |
|---|---|
| `sources` | URL, feed URL, type, pack, enabled, last fetch status/error |
| `items` | Raw fetched entries (kept forever; enables regenerating digests) |
| `stories` | Grouped items, category, score, summary, stats, pros/cons |
| `story_items` | Story ↔ item links |
| `digests` | One per day: date, window start/end, kind (daily/catch-up/raw), status, current stage |
| `digest_entries` | Digest ↔ story, tab (highlights/more), section, order |
| `learn_items` | Concept/quick-start content, quiz, related story |
| `learn_history` | Concept keys + dates for the 30-day no-repeat rule |
| `favorites` | Item/story ↔ user-defined **tags** (many-to-many; tags, not folders) |
| `feedback` | "Less like this" events |
| `items_fts` | FTS5 index over item and story text for archive search |

Archives are kept forever.

## 10. UI

| Page | Contents |
|---|---|
| **Today** | Highlights / More tabs, Learn section, progress strip while building, failed-sources badge |
| **Archive** | Date list + full-text search across all history |
| **Favorites** | Filter by tag |
| **Sources** | Add (paste URL), edit, enable/disable, per-source health |
| **Settings** | Provider, models, key, profile, Highlights cap |

Per-item actions: **open**, **favorite + tag**, **less like this**.

### First-run onboarding (≈2 minutes)

1. Choose a provider and enter a key, or auto-detect one from environment variables.
2. Write a profile, with examples shown.
3. Choose source packs.

The first digest then builds on screen.

## 11. Versioning & upgrades

- Semantic versioning on npm. Breaking schema changes ship only in major versions.
- Drizzle migrations **run automatically on startup**, and **always back up the database** to `~/.daily-diff/backups/` first. This is required because `npx` updates users without their knowledge.

## 12. Docs

- **README:** 60-second quick start, supported providers, measured cost per day, privacy statement.
- **docs/architecture.md:** this document.
- **CONTRIBUTING:** especially how to add a source pack (a JSON file).

## 13. Scope

### v1

Local `npx` app · builds on launch or first page load after the date changes · any provider through the AI SDK with the user's own key · RSS/API source packs (§5) · custom sources by pasted URL · 8-stage resumable pipeline with raw-digest fallback · Highlights + More · two daily Learn items tied to the day's content · archive with FTS search · favorites with tags · feedback recorded · onboarding wizard · SQLite with automatic, backed-up migrations · localhost-only, no telemetry.

### v2+

Personalization learned from favorites and feedback · opt-in HTML scraping · OS keychain · hosted multi-user version with accounts · desktop app · Reddit OAuth.

### Out of scope

X and Apple News.

## 14. Open items to resolve during build

- Verify every feed URL in the source packs (some company blogs may lack an official feed).
- Measure real build time and daily cost, then publish both in the README.
- Tune the relevance threshold and Highlights cap against a few weeks of real digests.
