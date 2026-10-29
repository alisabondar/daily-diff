# Daily Diff — instructions for coding agents

You are implementing a fully specified design. Your job is to **execute the plan, not redesign it.**

- **Contract:** `docs/build-plan.md`. Follow Part A (rules) at all times.
- **Rationale:** `docs/daily-diff-architecture.md`. Read it for context only; if it differs from the build plan, the build plan wins.

## Workflow

1. Find the next unfinished step in `docs/build-plan.md` Part C. The git log shows `step N:` commits.
2. Work on **only** that step: the files it lists and the behavior it specifies.
3. **If the step is marked [TDD]** (steps 1–14, plus the markdown parser in step 16), follow the order in Part A rule 9:
   - **Stub:** export the signatures, each throwing `not implemented`.
   - **Red:** write the tests under **Tests (write first)**, run them, and confirm that every new test fails on an assertion or on `not implemented`. A compile or import error doesn't count.
   - **Green:** write the minimum code that makes them pass.
   - **Refactor:** clean up while keeping every test passing.

   **If it isn't marked [TDD]** (the UI and packaging steps), implement it and do the manual checks.
4. Run the step's **Verify** checks, plus `npm run typecheck && npm test`. Fix the step until everything passes.
5. Commit as `step N: <title>`. For a [TDD] step, the commit body includes a summary of the red run and the green run. Then stop and report: what you did, the red and green results, how you verified it, and any entries added to `docs/plan-issues.md`.

## Hard rules

- Do **not** add dependencies outside the allowlist in §B.2.
- Do **not** add features, options, abstractions, or "improvements" that aren't in the plan.
- Do **not** write model IDs, feed URLs, or library APIs from memory. Look them up or verify them live.
- If the plan is ambiguous, wrong, or conflicts with reality, **stop**, write it up in `docs/plan-issues.md`, and ask the human.
- Never weaken the security invariants: the server binds to `127.0.0.1`, keys never leave the server or reach logs, and there is no telemetry.
- On [TDD] steps, never write implementation code before you've seen its tests fail. Never change a test just to make it pass. If a test looks wrong, log it in `docs/plan-issues.md` and ask.
- Tests never touch the network or need an API key. Use the injected `fetchFn`, `FakeLlm`, `now`, and `DAILY_DIFF_HOME`.

## General coding guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**In this project:** the build plan and the hard rules above take precedence. Each step's **Verify** section and its **Tests (write first)** list are already its success criteria. "Ask" means: log the issue in `docs/plan-issues.md` and stop.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
