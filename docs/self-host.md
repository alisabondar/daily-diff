# Run your own Daily Diff (fork and deploy)

The public site runs one neutral scrub for everyone. A fork runs its own: your sources, your LLM, and optionally ranking by a free-text profile. No code changes are needed; everything is configured with GitHub secrets and variables.

**Cost:** GitHub Actions and Pages are free for public repos, and Supabase's free plan is enough. You pay only for the LLM. A scrub reads every source in your packs and summarizes up to 60 stories, so check the token totals after the first week.

## 1. Fork

Fork this repository on GitHub. GitHub turns scheduled workflows **off** on forks; step 4 turns them on.

## 2. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Link it and apply the schema from your clone:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. Copy three values from the dashboard:
   - **Project URL** (`https://<ref>.supabase.co`): click **Connect** at the top of the project.
   - **Publishable key** (`sb_publishable_…`) and **secret key** (`sb_secret_…`): **Settings → API Keys**. If you only see a "Create new API keys" button, click it; the legacy `anon` and `service_role` keys are being retired.

Free projects pause after about a week without activity. The daily scrub writes every morning, which counts as activity.

## 3. Add secrets and variables

In your fork: **Settings → Secrets and variables → Actions**. Secrets go on the **Secrets** tab and variables on the **Variables** tab (both under "Repository", not "Environment").

Or use the GitHub CLI from your clone. `gh secret set` prompts for the value, so it never lands in your shell history:

```bash
gh secret set SUPABASE_SERVICE_ROLE_KEY
gh secret set ANTHROPIC_API_KEY
gh variable set SUPABASE_URL --body "https://<ref>.supabase.co"
gh variable set SUPABASE_PUBLISHABLE_KEY --body "sb_publishable_…"
gh variable set LLM_PROVIDER --body anthropic
gh variable set LLM_MODEL --body "<model id from your provider's docs>"
```

**Secrets** (never shown in logs or the site):

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | The Supabase **secret** key |
| `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`) | Your LLM key |
| `YOUTUBE_API_KEY` | Optional: makes YouTube channel feeds reliable |

**Variables:**

| Name | Value |
|---|---|
| `SUPABASE_URL` | The project URL |
| `SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (public by design; row-level security protects the data) |
| `LLM_PROVIDER` | `anthropic`, `openai`, `google`, `openrouter` or `bedrock` |
| `LLM_MODEL` | The model for the heavier stages; look up current model IDs in your provider's docs |
| `LLM_FAST_MODEL` | Optional: a cheaper model for grouping and scoring |
| `LLM_EFFORT` | Optional: reasoning effort (`provider-default`, `low`, `medium`, `high`, …) |
| `AWS_REGION` | Bedrock only: the region of your inference profile, e.g. `us-east-1` |
| `SCRUB_PROFILE` | Optional: a free-text description of what you care about; the scrub ranks by it |
| `SCRUB_INCLUDE_REDDIT` | Optional: `true` to fetch Reddit feeds and comments (off on the public site) |

## 4. Turn on Actions and Pages

1. **Actions** tab: enable workflows for the fork.
2. **Settings → Pages**: set **Source** to **GitHub Actions** (or run `gh api -X POST repos/<you>/<repo>/pages -f build_type=workflow`). Until this is done, the **pages** workflow fails at `configure-pages` with "Get Pages site failed… Not Found".
3. Run the **pages** workflow once (Actions → pages → Run workflow) to publish the site at `https://<you>.github.io/<repo>/`.

## 5. Sign-in with GitHub (for sync)

Sign-in is optional for viewers; it syncs settings and favorites across devices.

1. Create a GitHub OAuth app (**Settings → Developer settings → OAuth Apps**). Homepage: your Pages URL. Callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase: **Authentication → Sign In / Providers → GitHub**: enable it and paste the client ID and secret.
3. **Authentication → URL Configuration**: set the Site URL to your Pages URL and add it to the redirect URLs.

## 6. First scrub

Actions → **scrub** → Run workflow. It takes a few minutes. After that it runs on its own at about 05:20 America/New_York every day. GitHub disables scheduled workflows after 60 days with no repository activity; the scrub commits a small marker file before that happens.

## Customize

- **Sources:** edit `src/packs/*.json` and push. The catalog updates on the next scrub.
- **Profile:** set `SCRUB_PROFILE`.

## Develop locally

Needs Docker.

```bash
npm install
npm run db:start
npm run db:reset
```

Then `npx supabase status` shows the local URL and keys. `scripts/seed-local-scrub.ts` publishes a fake scrub to the local stack without an LLM key, and `npm run db:rls` checks the row-level security policies.
