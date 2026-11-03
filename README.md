# Daily Diff

A local-first daily AI & tech briefing.

> The full README (quick start, costs, privacy, Docker) is written in step 23 of `docs/build-plan.md`.

## AI setup

Daily Diff never asks for your API key in the browser, and never stores it in `config.json`. Everything is read from environment variables, which you can put in a `.env` file. It looks in this order, and the first match wins:

1. variables set in your shell
2. `.env` in the folder you start Daily Diff from (e.g. the repo root when developing)
3. `~/.daily-diff/.env` (or `$DAILY_DIFF_HOME/.env`), for `npx daily-diff` from anywhere

`.env` files are re-read on every lookup, so edits apply without a restart. The repo's `.gitignore` already excludes `.env`.

### Variables

| Variable | Required | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENROUTER_API_KEY` | yes, for that provider | API key (Ollama needs none) |
| `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION` | yes, for Bedrock | A [Bedrock API key](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html) and its region, e.g. `us-east-1` |
| `LLM_PROVIDER` | no | `anthropic`, `openai`, `google`, `openrouter`, `ollama` or `bedrock`. Overrides Settings |
| `LLM_MODEL` | no | Model for every stage. Overrides both model fields in Settings |
| `LLM_FAST_MODEL` | no | A cheaper model for the light stages (grouping, scoring). Defaults to `LLM_MODEL` |
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
