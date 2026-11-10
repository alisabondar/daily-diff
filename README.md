# Daily Diff

A local-first daily AI & tech briefing. Every day it reads your feeds, groups and ranks the stories with an LLM you choose, and serves a short digest at http://127.0.0.1:4242: Highlights (about a 1–2 minute read), a More tab, and an optional Learn Something New card. Everything runs and stays on your machine.

## Quick start

You need [Node.js](https://nodejs.org) 20.12 or later, git, and an API key for one LLM provider (Anthropic, OpenAI, Google, OpenRouter or Amazon Bedrock; or a local [Ollama](https://ollama.com), which needs no key).

**1. Get the code**

```bash
git clone https://github.com/alisabondar/daily-diff.git
cd daily-diff
npm install
```

**2. Add your key.** Create a `.env` file in the `daily-diff` folder with one line for your provider:

```bash
echo 'ANTHROPIC_API_KEY=your-key-here' >> .env
chmod 600 .env
```

Using another provider? Use `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENROUTER_API_KEY` instead, or see [Amazon Bedrock](#amazon-bedrock). `.env` is gitignored, so your key never gets committed.

**3. Start it**

```bash
npm start
```

**4. Set it up.** Open http://127.0.0.1:4242 and follow the three onboarding steps:
- **Provider:** it's pre-selected when a key is found. Click **Test connection**, then **Next**.
- **Profile:** a sentence about what you care about. This is what ranks the stories, so be specific.
- **Packs:** keep the defaults or pick your own.

The first digest takes about two minutes. After that, a new one builds the first time you open the app each day. Leave `npm start` running in a terminal while you use it, and stop it with Ctrl+C.

**Optional: reliable YouTube.** YouTube's RSS feeds fail often. With a free [YouTube Data API key](https://console.cloud.google.com/apis/library/youtube.googleapis.com) (enable "YouTube Data API v3", create an API key and restrict it to that API), add `YOUTUBE_API_KEY=…` to `.env` and channels are fetched through the API instead. A daily build uses about 14 of the 10,000 free units.

**Updating:** `git pull && npm install`, then `npm start` again. Your data in `~/.daily-diff` is kept.

Options: `npm start -- --port 4300` runs it on another port; `--version` and `--help` work too.

## Cost and build time (measured)

Three real builds on 2026-11-03, each from a fresh data directory (so each covers a 24-hour window), with the 5 default packs. Settings: Amazon Bedrock in `us-east-1`, `us.anthropic.claude-sonnet-5-5` for both tiers, `LLM_EFFORT=low`.

| Build | Time | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| 1 | 110.6 s | 76,336 | 18,097 | $0.37 |
| 2 | 109.3 s | 80,764 | 18,326 | $0.38 |
| 3 | 117.5 s | 81,735 | 20,596 | $0.41 |

Cost = tokens × Claude Sonnet 5.5's list price of $2 / MTok input and $10 / MTok output ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-11-03), plus the 10% premium that page lists for Bedrock regional (`us.`) endpoints. The [Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) loads its tables dynamically, so its exact rows couldn't be read; check it for your region. Setting `LLM_FAST_MODEL=us.anthropic.claude-haiku-5-5` moves the lighter stages to a cheaper model. That configuration hasn't been measured.

## Privacy

- The server binds to `127.0.0.1` only. In Docker it binds inside the container, and you publish it on `127.0.0.1` (see below).
- API keys are read from the environment or `.env`. They never appear in the browser, in API responses or in `config.json`, and error messages show `[redacted]` in their place.
- No telemetry and no analytics. The only outbound requests go to:
  - the feeds you've enabled;
  - `hn.algolia.com` (Hacker News);
  - `reddit.com` (comments, best-effort);
  - `www.googleapis.com` (YouTube Data API, only when `YOUTUBE_API_KEY` is set);
  - URLs you paste into **Add source** (including YouTube channel pages);
  - GitHub READMEs and docs pages for the quick-start card;
  - your configured LLM provider (for Bedrock, `bedrock-runtime.<region>.amazonaws.com`).

## Data and backups

Everything lives in `~/.daily-diff` (override with `DAILY_DIFF_HOME`): `daily-diff.db` (SQLite), `config.json` (mode 0600) and `backups/`. Before an upgrade migrates the database, Daily Diff copies it to `backups/` and keeps the 5 most recent copies. To start over, stop the app and delete the folder.

## AI setup

Daily Diff never asks for your API key in the browser, and never stores it in `config.json`. Everything is read from environment variables, which you can put in a `.env` file. It looks in this order, and the first match wins:

1. variables set in your shell
2. `.env` in the folder you start Daily Diff from (e.g. the repo root when developing)
3. `~/.daily-diff/.env` (or `$DAILY_DIFF_HOME/.env`), which works whatever folder you start it from

`.env` files are re-read on every lookup, so edits apply without a restart. The repo's `.gitignore` already excludes `.env`.

### Variables

| Variable | Required | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENROUTER_API_KEY` | yes, for that provider | API key (Ollama needs none) |
| `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION` | yes, for Bedrock | A [Bedrock API key](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html) and its region, e.g. `us-east-1` |
| `LLM_PROVIDER` | no | `anthropic`, `openai`, `google`, `openrouter`, `ollama` or `bedrock`. Overrides Settings |
| `LLM_MODEL` | no | Model for every stage. Overrides both model fields in Settings |
| `LLM_FAST_MODEL` | no | A cheaper model for the light stages (grouping, scoring). Defaults to `LLM_MODEL` |
| `YOUTUBE_API_KEY` | no | A [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key. When set, YouTube channels are fetched through the API instead of RSS. It's sent as a request header, never in a URL |
| `LLM_EFFORT` | no | Reasoning effort: `provider-default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max` |

Example:

```bash
cat >> .env <<'ENV'
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-5-5
LLM_FAST_MODEL=claude-haiku-5-5
LLM_EFFORT=low
ANTHROPIC_API_KEY=your-key-here
ENV
chmod 600 .env
```

Settings and onboarding show where each value came from, mark the overridden fields "set in .env", and warn about values they ignore. **Test connection** checks the key.

### Amazon Bedrock

```bash
LLM_PROVIDER=bedrock
LLM_MODEL=us.anthropic.claude-sonnet-5-5
LLM_FAST_MODEL=us.anthropic.claude-haiku-5-5
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
AWS_REGION=us-east-1
```

Daily Diff calls the Bedrock Converse API directly with the API key as a bearer token (no AWS SDK). Use an inference profile ID that's valid for your region (see the model's card in the Bedrock docs). The first build can be slow: Bedrock compiles each new output schema once, which can take up to ~90 seconds, and caches it for 24 hours.

## Docker

```bash
docker build -t daily-diff .
docker run -d --name daily-diff \
  -p 127.0.0.1:4242:4242 \
  -v daily-diff-data:/data \
  --env-file .env \
  daily-diff
```

Always publish the port on `127.0.0.1` as shown. Inside the container the server binds `0.0.0.0` (via `DAILY_DIFF_HOST`, which is honored only inside Docker) so port mapping works. Without `127.0.0.1:` in `-p`, Docker would expose it to your network. Data lives in the `/data` volume, and `--env-file` passes your keys without copying `.env` into the image (`.dockerignore` excludes it).

## More

- Architecture and design rationale: [docs/daily-diff-architecture.md](docs/daily-diff-architecture.md)
- Contributing and adding source packs: [CONTRIBUTING.md](CONTRIBUTING.md)
