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
| youtube | all 7 channels | channel IDs not confirmed; pack ships empty |
| security | Prompt Armor | no feed on promptarmor.com/resources |
| security | Simon Willison: prompt injection | tag feed URL not confirmed |

Filled in: Ben's Bites (`bensbites.com/feed`), Dwarkesh Podcast (`dwarkesh.com/feed`), Software Engineering Daily (`softwareengineeringdaily.com/category/podcast/feed`) — all OK in the run above.
