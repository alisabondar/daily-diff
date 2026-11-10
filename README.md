# Daily Diff

A daily AI & tech briefing that runs on your own machine. It reads your feeds, groups and ranks the stories with an LLM you choose, and serves a short front page at http://127.0.0.1:4242.

## Quick start

You need [Node.js](https://nodejs.org) 20.12+, git, and an API key for one LLM provider: Anthropic, OpenAI, Google, OpenRouter or Amazon Bedrock. A local [Ollama](https://ollama.com) needs no key.

```bash
git clone https://github.com/alisabondar/daily-diff.git
cd daily-diff
npm install
echo 'ANTHROPIC_API_KEY=your-key-here' >> .env
npm start
```

For another provider, use `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENROUTER_API_KEY` instead, or see [Amazon Bedrock](#amazon-bedrock). `.env` is gitignored.

Then open http://127.0.0.1:4242 and go through onboarding:
1. **Test connection** with your provider.
2. **Describe what you care about.** This is what ranks the stories, so be specific.
3. **Pick source packs.**

The first digest takes about two minutes. After that, a new one builds the first time you open the app each day, while `npm start` is running.

- **Update:** `git pull && npm install && npm start`. Your data in `~/.daily-diff` is kept.
- **Other port:** `npm start -- --port 4300`.
- **Cost:** about $0.40 per daily build with Claude Sonnet 5.5 (measured on Bedrock). Setting a cheaper `LLM_FAST_MODEL` lowers it.

### Optional: reliable YouTube

YouTube's RSS feeds fail often. Create a free [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key (enable the API, then create an API key restricted to it) and add `YOUTUBE_API_KEY=…` to `.env`. A daily build uses about 14 of the 10,000 free daily units.

## Configuration

Keys and model settings come from environment variables or `.env`. The first match wins: your shell, then `./.env`, then `~/.daily-diff/.env`. Changes apply without a restart. Keys are never shown in the browser or written to `config.json`.

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY` | API key for that provider |
| `LLM_PROVIDER` | `anthropic`, `openai`, `google`, `openrouter`, `ollama` or `bedrock` (overrides Settings) |
| `LLM_MODEL` | Model for every stage (overrides Settings) |
| `LLM_FAST_MODEL` | A cheaper model for the light stages (grouping, scoring); defaults to `LLM_MODEL` |
| `LLM_EFFORT` | Reasoning effort: `provider-default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max` |
| `YOUTUBE_API_KEY` | Optional; fetch YouTube channels through the Data API |

### Amazon Bedrock

```bash
LLM_PROVIDER=bedrock
LLM_MODEL=us.anthropic.claude-sonnet-5-5
LLM_FAST_MODEL=us.anthropic.claude-haiku-5-5
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
AWS_REGION=us-east-1
```

Use a [Bedrock API key](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html) and an inference profile ID that's valid for your region. The first build can take an extra ~90 seconds while Bedrock compiles its output schemas.

## Privacy

- The server listens on `127.0.0.1` only, so nothing else on your network can reach it.
- No telemetry. The only outbound requests go to:
  - your enabled feeds;
  - Hacker News (`hn.algolia.com`) and Reddit, for stories and comments;
  - the YouTube Data API, if you set a key;
  - URLs you add as sources, plus docs pages for the "Learn" card;
  - your LLM provider.

## Data

Everything lives in `~/.daily-diff` (override with `DAILY_DIFF_HOME`). The database is backed up automatically before upgrades. To start over, stop the app and delete the folder.

## Docker

```bash
docker build -t daily-diff .
docker run -d --name daily-diff -p 127.0.0.1:4242:4242 -v daily-diff-data:/data --env-file .env daily-diff
```

Keep `127.0.0.1:` in `-p`. Without it, Docker exposes the app to your network.

## More

- Design and architecture: [docs/daily-diff-architecture.md](docs/daily-diff-architecture.md)
- Contributing and adding source packs: [CONTRIBUTING.md](CONTRIBUTING.md)
