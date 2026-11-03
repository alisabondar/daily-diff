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
| `LLM_PROVIDER` | no | `anthropic`, `openai`, `google`, `openrouter` or `ollama`. Overrides Settings |
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

> Amazon Bedrock (`LLM_PROVIDER=bedrock` with `AWS_BEARER_TOKEN_BEDROCK` and `AWS_REGION`) isn't supported yet. Until it is, Settings shows it as an ignored value.
