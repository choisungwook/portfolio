# LLM Indexer

Summarizes completed sessions (`Stop` / `SessionEnd`) and reconciles durable facts (`ADD` / `UPDATE` / `NOOP`) in a detached background process without deleting raw observations.

- `index.ts`: `indexSession()` collects raw observations and candidate project memories, parses structured JSON output, stores `kind: 'summary'`, applies `ADD`/`UPDATE` (invalidating superseded rows via `valid_until`)/`NOOP`, and `spawnBackgroundIndex()` runs `aimem index <session-id>` detached so `aimem hook` never waits.
- `providers.ts`: `claude` (default `claude-haiku-5-5`, `effort: low`, `ANTHROPIC_API_KEY`) and `openai` (`OPENAI_API_KEY`) HTTP callers using Node's `fetch` (inheriting custom CA bundles from `src/connection/ca-bundle.ts`).
- Set `indexer.provider` to `"none"` to disable background summarization; raw observations remain searchable.
