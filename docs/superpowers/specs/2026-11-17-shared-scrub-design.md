# Shared morning scrub, hosted app and sync — design

Status: approved by the human (2026-11-17), revised 2026-11-18. Once approved, it becomes new steps in `docs/build-plan.md` (Part E), and the conflicts below are logged in `docs/plan-issues.md`.

## Revisions (2026-11-18)

These override the sections below where they differ:
- **No owner fork.** The owner uses the shared scrub and personalizes through topics, keywords and "Less like this". The import (§7) targets the shared project. Only one Supabase project and one LLM scrub a day.
- **Sign-in is GitHub OAuth only**, not an email magic link, so no email provider is needed.
- **Reddit appears only in forks that set `SCRUB_INCLUDE_REDDIT=true`.** The shared scrub neither fetches Reddit nor publishes Reddit-derived pros/cons. Imported history is stripped of Reddit content the same way.
- **The schedule runs at :17** past 09:00 and 10:00 UTC, ready around 05:30 ET.
- **Browsers cache published days** (the 14 most recent).
- **The onboarding gate has one exception:** the explicit "Already have an account? Sign in" action.
- **Milestones:** M1 is the scrub plus a hosted site with no accounts; M2 is sync plus the import. Deleting the old local-server code is deferred.

## Intent

Today every install runs its own daily pipeline with its own API key, filtered by its own profile. The owner already pays for one scrub a day. The goal is for that **one scrub to serve everyone**. It runs centrally at 5am ET without the owner's laptop and fetches every source in the catalog. Each person gets a **filtered view** of it based on their own settings, on desktop and phone, with their settings and favorites synced.

People who want their own sources or LLM ranking by free-text profile **fork and deploy** the same code with their own key and their own Supabase project.

## Goals

1. A scheduled GitHub Actions job runs the scrub daily at 05:00 America/New_York, all year, across daylight-saving changes.
2. The scrub fetches **every source in every pack**, whatever anyone's settings are, and publishes the result to Supabase.
3. A hosted website, built from the existing React UI, shows each user's filtered and ranked view of each day's scrub. It works on phones.
4. **A new user makes no Supabase call until onboarding is finished.** Settings live on the device until then.
5. Accounts are optional. Signing in syncs settings, favorites, tags, feedback and the reading streak across devices.
6. Suggesting a source opens a pre-filled GitHub issue. Contributing one means a pull request to `src/packs/*.json`.
7. Forking and deploying is documented and works without code changes. Configuration comes from secrets and variables.
8. A one-time import moves the owner's existing local data into Supabase (§7).

## Non-goals (for now)

- A native mobile app; the responsive website covers phones. Making it installable (manifest and service worker) is a later step.
- Push notifications.
- LLM ranking by free-text profile on the hosted site. That's what a fork is for.
- Users adding arbitrary feeds in the app, feed discovery, and per-user suggested sources (step 30). These are replaced by the suggestion flow.
- A backend for the suggestion form; the GitHub issue *is* the form.
- Anonymous Supabase accounts; local-first settings cover the before-sign-in period.
- Keeping the laptop-only local mode. Anyone who insists can run Supabase locally.

## Anti-goals (failure even if it works)

- Any request to Supabase before onboarding is finished, or settings sent anywhere before the user signs in.
- Republishing article text, raw comments or usernames.
- An API key or the Supabase service-role key in the frontend bundle, the repo, logs or any API response.
- Analytics or telemetry of any kind.
- A fork that needs code edits to work.

## Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | Actions cron → static JSON on GitHub Pages; app stays local | Free and simple, but no phone access or sync | Superseded once mobile and sync were added |
| **A2** | **Actions cron → Supabase Postgres; hosted static web app; Supabase Auth with row-level security for user data** | **One backend. Archive search is a Postgres query. Needs accounts and one new dependency** | **Chosen** |
| A3 | Static JSON scrub + Supabase only for user data | Cheapest reads, but searching across days is awkward and there are two data sources | Rejected |
| A4 | React Native app | Most native feel; a second UI codebase plus app-store review | Rejected |
| B | Hosted Hono server and database on Fly or Render | Exact timing; a server to pay for and secure | Rejected |
| Self-host 1 | **Fork and deploy the same stack** | One code path; the laptop-only mode goes away | **Chosen** |
| Self-host 2 | Keep the local SQLite app alongside | Every feature built twice | Rejected |

## Design

### 1. Scheduled scrub (GitHub Actions)

- `.github/workflows/scrub.yml` runs on `schedule` at **09:00 and 10:00 UTC**, plus `workflow_dispatch`. The first step exits unless the hour in `America/New_York` is 05, so exactly one run does the work in summer and in winter. Manual runs skip the check.
- **Late starts:** GitHub can start scheduled jobs late, so "5am" means "about 5am". The scrub is idempotent per date: a second run on the same date overwrites that day's scrub and creates no duplicates.
- **Keepalive:** GitHub turns off scheduled workflows after 60 days with no repo activity (GHES 3.13 docs; check against current public docs). The scrub writes to Supabase, not the repo, so the workflow needs a keepalive. *Builder's call:* either use GitHub's API to re-enable the workflow, or commit a small `scrub/last-run` marker no more than about every 50 days. Don't add a third-party action without approval.
- **Forks:** GitHub turns scheduled workflows off by default on forks, so the fork guide says to turn them on.
- **The runner:** the job runs the existing pipeline in an empty, temporary data folder (`DAILY_DIFF_HOME`) through a new CLI command, `daily-diff scrub`, then exports the result (§3). The fetch window starts from the previous published scrub date, read from Supabase and capped at 7 days, the same as today's catch-up rule.
- **Secrets:** the LLM key (`ANTHROPIC_API_KEY` or another provider's key), `SUPABASE_SERVICE_ROLE_KEY`. **Variables:** `SUPABASE_URL`, provider and models, and an optional `SCRUB_PROFILE` (empty means a neutral scrub; a fork may set it).
- On failure, the job fails loudly; GitHub emails the owner. Keys are redacted from all output, as today.

### 2. Pipeline changes

- **S1:** fetch every catalog source (all packs, including YouTube), ignoring `enabled`.
- **S4:** without `SCRUB_PROFILE`, scores general importance to a software engineer interested in AI, which is already the empty-profile rule, and assigns category and topic as today.
- **S6:** summarize enough for any reasonable filter: the top *K* stories per topic and per category above the threshold, with a hard cap on the total (*builder's call:* about 60 a day, tuned against cost). The stats guard and the pros/cons rules are unchanged.
- **S7:** keeps Learn and the quick starts. **The Highlights write-up moves to the client** (§5), because it depends on each user's filter.
- **S8:** writes the local digest as today, then the exporter (§3) publishes it.
- Missed-day splitting (step 29) goes away on the client. Archive simply lists the published days.

### 3. Published data (Supabase, readable by anyone)

Schema in `supabase/migrations/*.sql`. Tables, *names are the builder's call*:

- `scrubs(date pk, window_start, window_end, published_at, story_count)`
- `scrub_stories(key pk, date fk, title, url, source_ids[], category, topic, score, summary, stats jsonb, pros[], cons[], quickstart jsonb, read_minutes, published_at)`. `key` is a stable hash of the first canonical URL, so favorites survive a re-run.
- `scrub_learn(date fk, …)` for the Learn section.
- `catalog_sources(id, pack, title, url, type, kind)`, mirrored from `src/packs` on each run, so the client can show the source list.

**An explicit list of exported fields.** The exporter writes only the fields above. Never: `items.content`, `items.excerpt`, raw comments, usernames, usage or cost, error text, the profile.

Row-level security: `select` for `anon` and `authenticated`; insert, update and delete only for the service role. Full-text search uses a generated `tsvector` on title and summary.

Storage estimate: about 60 stories a day at about 2 KB is about 45 MB a year, well under the free tier's 500 MB (third-party figure; check against supabase.com/pricing).

### 4. User data (Supabase, private)

- `user_settings(user_id pk, packs[], disabled_sources[], topics[], keywords[], highlights_cap, relevance_threshold, updated_at)`
- `favorites(user_id, story_key, created_at)` and `favorite_tags(user_id, story_key, tag)`. Favorites hold `story_key`; scrub stories are never deleted while favorited (*the builder chooses a deletion rule, if any*).
- `feedback(user_id, story_key, kind, created_at)`
- `streaks(user_id pk, …)`, moved from the local version.
- Row-level security: every operation requires `user_id = auth.uid()`. Deleting the account cascades.

### 5. Hosted web app

- The existing Vite and React UI, built as a static site and deployed to **GitHub Pages** by a workflow on pushes to `main`. A fork gets its own Pages site. The Supabase URL and publishable (anon) key are build-time env values. The publishable key is designed to be public, and row-level security is what protects the data.
- **`src/web/api.ts` is rewritten** on `@supabase/supabase-js`. The Hono server no longer serves users; it remains only as the code the scrub CLI uses.
- **Onboarding gate:** the first visit shows onboarding (packs, topics, keywords). Settings are saved to `localStorage` only. **The Supabase client isn't even created** until `onboarded` is true, enforced in one module and covered by a test.
- **Sign-in (optional):** Supabase Auth email magic link. On first sign-in, local settings and favorites are uploaded; after that, Supabase is the source of truth and `localStorage` is a cache. Signing out keeps the local copy.
- **Ranking and filtering on the client** (pure functions, unit-tested):
  - Keep stories whose source is enabled and whose pack is on.
  - `rank = score + 2·topicMatch + 1·keywordMatch − 3·lessLikeThis(source or topic)`. *The weights are the builder's call, tuned by hand.*
  - Highlights = the top `highlightsCap` by rank, grouped into the existing sections; More = the rest at or above `relevanceThreshold`.
- **Settings page:** the provider, model and key fields are removed. Profile becomes topic picks plus keywords.
- **Sources page:** the catalog with toggles, plus a **"Suggest a source"** link to `https://github.com/<owner>/<repo>/issues/new?…` with a pre-filled title and template. The owner and repo come from build env, so forks point at themselves. Feed discovery and adding a URL are removed.
- **Privacy note** page plus **Delete account**.

### 6. Fork-and-deploy guide (`docs/self-host.md`)

The steps: fork → create a Supabase project and apply the migrations → add the secrets and variables → turn on Actions schedules and Pages → optionally set `SCRUB_PROFILE` and edit the packs. No code edits.

### 7. One-time import of existing local data

- A CLI command, `daily-diff import-local --user <email>`, reads `~/.daily-diff` (SQLite) and writes to a Supabase project using the service-role key from the environment. It is run once, by hand, on the owner's laptop.
- **Target:** the owner's **personal fork's** Supabase project. That's where the history was ranked by the owner's profile.
- **What it imports:**
  - Past digests and stories go into the scrub tables, through the same export field list (§3). The stable keys are computed the same way, so a story that's also in a new scrub doesn't duplicate.
  - Favorites, tags, feedback and the streak go to that user's rows. The user is looked up by email, so they must have signed in once first.
- **Behavior:** idempotent, so re-running it changes nothing. It prints counts. It never deletes local data.

## Deployments

- **This repo (public):** a neutral scrub with no `SCRUB_PROFILE`, serving everyone.
- **The owner's personal fork:** its own scrub with `SCRUB_PROFILE` set, its own Pages site, and its own Supabase project.
- The two Supabase projects use **both free-tier project slots** on the owner's account (two-project cap; third-party figure, to be checked).
- **Cost:** two LLM scrubs a day instead of one. The fork could skip packs it doesn't need to save cost.

## Constraints and conflicts with the current plan

These are logged in `docs/plan-issues.md` and need the human's sign-off:

- **Rule 7 (security):** "binds to 127.0.0.1" no longer applies to the hosted app. It's replaced by: keys only in Actions secrets; the service-role key never in the frontend; row-level security on every table; outbound calls from the scrub as today plus Supabase; from the browser, only Supabase.
- **§B.2 dependencies:** add `@supabase/supabase-js` (runtime) and the Supabase CLI (`supabase`, dev, for migrations). **Approved by the human (2026-11-17).**
- **Architecture:** "no accounts in v1" and "one install = one user" are replaced by optional accounts.
- **Free-tier facts to check before building** (from third-party sources, 2026):
  - Supabase pauses free projects after 7 days without activity; the daily writes should prevent this.
  - Two-project cap.
  - The built-in auth email sender has low rate limits, so custom SMTP may be needed for real use.

## Left to the builder

The exact table and column names, the S6 per-topic *K* and total cap, the ranking weights, the keepalive mechanism, the cache size of stories kept locally, the step order in Part E, and the tests for each pure function (export field list, onboarding gate, ranking, the 5am-ET hour check).

## Calls made by Claude (for the human to check)

- "Less like this" down-ranks that source and topic for the user, and syncs. It doesn't affect the shared scrub.
- No anonymous accounts. Settings stay in `localStorage` until sign-in (a reported bug in upgrading anonymous accounts by email code).
- GitHub Pages, not Cloudflare, so everything stays in one place.
- Plain website first; installability later.
- The public scrub is neutral. The owner runs a personal fork with `SCRUB_PROFILE` (the human decided this).
