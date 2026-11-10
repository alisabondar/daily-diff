# Feed verification

Run: `npx tsx scripts/verify-packs.ts` (in a sandbox that blocks tsx's IPC pipe, use `node --import tsx scripts/verify-packs.ts`).

## Run 2026-10-29 (by the human, outside the agent sandbox)

33 of 35 rss feeds OK. Failures:

```
│ 10 │ 'community' │ 'r/MachineLearning' │ 'FAIL HTTP 429' │ '-' │ 'https://www.reddit.com/r/MachineLearning/top/.rss?t=day' │
│ 11 │ 'community' │ 'r/programming'     │ 'FAIL HTTP 429' │ '-' │ 'https://www.reddit.com/r/programming/top/.rss?t=day'     │
```

HTTP 429 is Reddit rate-limiting parallel requests, not a bad URL (r/LocalLLaMA on the same pattern passed). Both kept; Reddit is best-effort per rule 7.

## FIND entries removed (§D)

Removed because no official feed could be located and confirmed; re-add via a pack PR once one is verified.

| Pack | Source | Note |
|---|---|---|
| ai-news | The Batch | no feed link on deeplearning.ai/the-batch |
| ai-news | Anthropic News | no feed link on anthropic.com/news |
| tools | HF Daily Papers | no official feed confirmed |
| headlines | TLDR Tech | no feed link on tldr.tech |
| podcasts | Lenny's Podcast | Substack podcast feed ID not found |
| podcasts | WSJ Tech News Briefing | feed not confirmed |
| podcasts | Latent Space podcast | same publication feed as ai-news Latent Space (plan: skip) |
| podcasts | Hard Fork | nytimes.com not reachable by the agent |
| security | Prompt Armor | no feed on promptarmor.com/resources |
| security | Simon Willison: prompt injection | tag feed URL not confirmed |

Filled in: Ben's Bites (`bensbites.com/feed`), Dwarkesh Podcast (`dwarkesh.com/feed`), Software Engineering Daily (`softwareengineeringdaily.com/category/podcast/feed`) — all OK in the run above.

## YouTube (2026-11-03)

Channel IDs come from each `@handle` page's `externalId` (it matches the canonical `/channel/` link), found with the app's own discovery (`POST /api/sources/discover`). Each feed was confirmed to parse, with 3 preview items and the channel's own title.

| Channel | Channel ID | Latest video |
|---|---|---|
| Anthropic | UCrDwWp7EBBv4NwvScIpBDOA | 2026-09-23 |
| OpenAI | UCXZCJLdBC09xxGZ6gcdrc6A | 2026-11-03 |
| Google DeepMind | UCP7jMXSY2xbc3KCAE0MHQ-A | 2026-10-27 |
| Fireship | UCsBjURrPoezykLs9EqgamOA | 2026-11-03 |
| AI Explained | UCNJ1Ymd5yFuUPtn21xtRbbw | 2026-11-02 |
| Two Minute Papers | UCbfYPyITQ-7l4upoX8nvctg | 2026-10-30 |
| ThePrimeagen | UC8ENHE5xdFSwx71u3fDH5Xw | 2026-08-06 |

2026-11-10: the three Reddit rows above were replaced by one combined feed, `r/LocalLLaMA+MachineLearning+programming/top/.rss?t=day`: 200, 25 entries (see docs/plan-issues.md).

2026-11-10: the remaining FIND rows, verified live:
| pack | source | feed | result |
|---|---|---|---|
| podcasts | Lenny's Podcast | `https://api.substack.com/feed/podcast/10845.rss` (found by discovery from lennysnewsletter.com/podcast) | 200, 369 items, latest 2026-11-08 |
| podcasts | WSJ Tech News Briefing | `https://video-api.shdsvc.dowjones.io/api/podcasts/the%20wall%20street%20journal%20tech%20talk/feed` (Apple Podcasts directory) | 200, 600 items, latest 2026-11-10 |
| podcasts | Hard Fork | `https://feeds.simplecast.com/6HKOhNgS` (Apple Podcasts directory) | 200, latest 2026-11-10 |
| podcasts | Latent Space podcast | skipped: latent.space serves one feed, already in ai-news | — |
| security | Simon Willison: prompt injection | `https://simonwillison.net/tags/prompt-injection.atom` (linked from the tag page) | 200, 30 entries |
| security | Prompt Armor | still no RSS/Atom feed on promptarmor.com | not added |
| security | Embrace The Red (replaces Prompt Armor) | `https://embracethered.com/blog/index.xml` | 200, 233 items, latest 2026-10-13 |
