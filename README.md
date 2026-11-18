# Daily Diff

A calm daily AI & tech briefing. Every morning at about 5:20am ET, one shared scrub reads every source in the catalog, groups and ranks the stories with an LLM, and publishes them. Each reader gets a filtered view, ranked by their own topics, keywords and packs, on desktop or phone.

https://github.com/user-attachments/assets/d92db50f-ec4b-41bc-b768-570ce63376e5

## Use it

Open the site, pick topics, keywords and packs, and read. Nothing leaves your browser until you finish setup. Sign in with GitHub to sync settings and favorites between devices (optional).

- **Suggest a source:** the Sources page links to a pre-filled issue, or open a pull request that edits `src/packs/*.json`.
- **"Less like this"** ranks that topic and source lower for you only.

## Run your own

Want your own sources, your own LLM, or ranking by a free-text profile? Fork the repo and follow **[docs/self-host.md](docs/self-host.md)**. It needs no code changes, just GitHub secrets and variables, a free Supabase project, and an LLM key.

## How it works

- **Scrub** (`.github/workflows/scrub.yml`): GitHub Actions runs `daily-diff scrub --scheduled` at 09:17 and 10:17 UTC. Only the run that falls between 05:00 and 06:59 New York time scrubs, and only once a day. The pipeline (fetch → group → score → enrich → summarize → compose) runs on a fresh database. Then it publishes an explicit list of fields to Supabase: titles, links, summaries, stats, tags, scores and the Learn section. Article text, comments and usage data never leave the job.
- **Site** (`.github/workflows/pages.yml`): a static React app on GitHub Pages. Each viewer's copy filters and ranks the day's scrub in the browser and caches published days locally.
- **Sync:** optional GitHub sign-in. Settings, favorites, feedback and reading days are stored per user under Postgres row-level security.

## Configuration (the scrub)

| Variable | Meaning |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Where the scrub publishes (the secret key lives only in Actions secrets) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK` | LLM key for the chosen provider |
| `LLM_PROVIDER` | `anthropic`, `openai`, `google`, `openrouter`, `ollama` or `bedrock` |
| `LLM_MODEL` / `LLM_FAST_MODEL` | Models for the heavy and light stages |
| `LLM_EFFORT` | Reasoning effort: `provider-default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max` |
| `SCRUB_PROFILE` | Optional free-text profile to rank by (forks); empty means general importance |
| `SCRUB_INCLUDE_REDDIT` | `true` to include Reddit (forks only; off on the public site) |
| `YOUTUBE_API_KEY` | Optional; fetch YouTube channels through the Data API |

## Privacy

- No analytics or telemetry. The site talks only to its own Supabase project.
- Before you sign in, your settings live only in your browser. After, each row is readable only by you, and **Delete account** removes everything.
- Keys stay in GitHub Actions secrets. The site bundle carries only the public Supabase URL and the publishable key, and the deploy fails if anything key-shaped is in it.

## More

- Design and architecture: [docs/daily-diff-architecture.md](docs/daily-diff-architecture.md)
- Contributing and adding source packs: [CONTRIBUTING.md](CONTRIBUTING.md)
- Re-recording the demo GIF: see the header of [scripts/record-demo.mjs](scripts/record-demo.mjs)
