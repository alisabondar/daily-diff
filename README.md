# Daily Diff

A local-first daily AI & tech briefing.

> The full README (quick start, costs, privacy, Docker) is written in step 23 of `docs/build-plan.md`.

## AI setup

Daily Diff never asks for your API key in the browser, and never stores it in `config.json`. It reads the key from an environment variable, or from a `.env` file in its data directory:

```
~/.daily-diff/.env        # or $DAILY_DIFF_HOME/.env
```

1. Pick a provider and add its key to that file. Only the line for your provider is needed:

   | Provider | Variable |
   |---|---|
   | Anthropic | `ANTHROPIC_API_KEY` |
   | OpenAI | `OPENAI_API_KEY` |
   | Google | `GOOGLE_GENERATIVE_AI_API_KEY` |
   | OpenRouter | `OPENROUTER_API_KEY` |
   | Ollama | none (set the base URL in the app; default `http://localhost:11434/v1`) |

   ```bash
   mkdir -p ~/.daily-diff
   echo 'ANTHROPIC_API_KEY=your-key-here' >> ~/.daily-diff/.env
   chmod 600 ~/.daily-diff/.env
   ```

2. Start Daily Diff and choose the same provider in onboarding (or Settings). It shows where the key was found, and **Test connection** checks it. Edits to `.env` apply without a restart.

A variable set in your shell takes priority over the same name in `.env`. The file lives outside any project folder, so it can't be committed by accident. Treat it like any other secret.
