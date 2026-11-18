# Plan issues

## Open

- **2026-11-18, step 32 (decided by Claude while running Phase 8 on the human's instruction):** `PublishedStory` carries `links: { url, sourceId, sourceTitle, discussionUrl, mediaUrl }[]` in place of `url` and `sourceTitles`. The existing StoryCard renders every link, plus 💬 and 🎧, so a single URL would lose them. No private field is added. `readMinutes` is now exported from `src/server/stories.ts` and reused.
- **2026-11-18, before step 34 (Claude's call):** every scrub seeds a fresh database, so SQLite source ids depend on seeding order, and adding a pack source would shift them and corrupt users' `disabled_sources`. Published stories, links and `catalog_sources` therefore use `sourceKey(feedUrl)`, a 16-hex sha256, and `user_settings.disabled_sources` is `text[]`. The step 32 tests were updated for this spec change, not to make them pass. The migrations were edited in place because they had never been deployed.
- **2026-11-18, step 36 (Claude's call, under the approved Phase 8 rule-7 amendment):**
  - `tests/invariants.test.ts` used to forbid `import.meta.env` anywhere in `src/web`. It now allows exactly `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_GITHUB_REPO`, read only in `src/web/data/public-env.ts`.
  - It also adds a check that no service-role or secret-key name appears in `src/web`.
  - This narrows the rule; it doesn't remove it.
- **2026-11-18, step 36 data shapes (Claude's call):**
  - The streak syncs as `reads(user_id, date, finished_at, quiz_correct, quiz_total)`, computed by the existing pure `computeStreak`, instead of a `streaks` row. Merging read dates as a union is exact; merging two streak counters isn't.
  - `feedback` copies the story's `topic` and `source_key`, so "Less like this" still down-ranks on later days.
  - Section enums moved to `src/shared/enums.ts` and the published types to `src/shared/published.ts`, so the browser imports them without Drizzle or `node:crypto`. `schema.ts` and `publish-shape.ts` re-export them.
  - Day caching is a `cachedDays(reader, storage)` wrapper over a `DayReader` interface; that's testable without a fake Supabase client.
