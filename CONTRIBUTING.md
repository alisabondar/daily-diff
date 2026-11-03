# Contributing

## Dev setup

```bash
git clone <this repo> daily-diff
cd daily-diff
npm ci
npm run dev        # server on http://127.0.0.1:4242 (tsx watch) + Vite on http://localhost:5173
```

Open http://localhost:5173. For a full digest without an API key or network, run:

```bash
npm run demo       # seeds ./.demo-home from fixtures with a fake LLM, then serves it on :4242
```

Put API keys in a `.env` at the repo root (it's gitignored). See "AI setup" in the README.

## Tests

```bash
npm run typecheck
npm test
```

Tests never touch the network or need an API key. They inject `fetchFn`, `FakeLlm`, `now` and a temp `DAILY_DIFF_HOME`, and `tests/setup.ts` keeps them from reading your real `.env`. Backend changes are test-first: write the failing test, see it fail, then implement.

## Adding a source pack

One pack per PR. A pack is a JSON file in `src/packs/`, validated with Zod at load:

```json
{ "id": "ai-news", "name": "AI News", "emoji": "🧠", "defaultEnabled": true,
  "sources": [
    { "title": "Simon Willison", "url": "https://simonwillison.net", "feedUrl": "https://simonwillison.net/atom/everything/",
      "kind": "rss", "type": "blog", "defaultEnabled": true }
  ] }
```

- `type` is one of `news`, `podcast`, `video`, `blog`, `community`.
- A source's `defaultEnabled` falls back to the pack's value when omitted. In a pack that's off by default, set `"defaultEnabled": true` on the sources that should switch on when the pack is enabled.
- For `kind: "hn"`, `feedUrl` is a synthetic unique key such as `hn:front_page`, and `hnTags` is required.
- Every `feedUrl` must be an official RSS/Atom feed that you have checked. Never scrape.

Then confirm every feed is live and parses:

```bash
npx tsx scripts/verify-packs.ts
```

Record the result in `src/packs/VERIFY.md`.
