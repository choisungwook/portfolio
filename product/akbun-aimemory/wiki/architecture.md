# Architecture

## Processes

There is no daemon. Every hook runs `aimem hook`, which opens the SQLite file, does one thing and exits. `aimem serve` is a separate, optional process for the web UI; both use WAL mode so they can write at the same time.

## Hook flow

`aimem hook --agent <name>` reads the hook JSON on stdin (`src/hook.ts`).

1. Open the store and replay `spool.jsonl` if it exists.
2. Normalise the event name: `SessionStart`/`agentSpawn` print context, `*Prompt*` stores the prompt, `PostToolUse` stores tool name, input and response (truncated to 2000 chars), `Stop` stores `last_assistant_message`, `SessionEnd` marks the session ended.
3. On any error, append the payload to `spool.jsonl`, warn on stderr and exit 0.

## Storage

One file, `$AIMEMORY_HOME/data/aimemory.db` (`src/store.ts`).

| Table | Content |
|---|---|
| `sessions` | id, agent, project (basename of cwd), start and end time |
| `memories` | session, kind (`prompt`, `tool`, `response`, `note`, `summary`), content, `digest` (unique, dedups double hook calls), `vec` (512 float32) |
| `memories_fts` | FTS5 over the tokenizer output, rowid = memory id |
| `meta` | `tokenizer`: id of the tokenizer that built the index |

## Search

`search()` tokenizes the query once, then runs BM25 on `memories_fts` and cosine on `vec` (`src/vector.ts`, FNV-1a hashed term frequency). The two rankings are fused with RRF (k = 60) and multiplied by `0.7 + 0.3 * 0.5^(age / halfLifeDays)`.

## Tokenizer

`src/tokenizer.ts`. `builtin` splits by script: Latin words, CJK character bigrams, Hangul words plus bigrams. `command` runs an external tokenizer with text on stdin and expects a JSON array or whitespace-separated tokens. Changing it needs `aimem reindex`; the store warns when the stored id differs.

## HTTP API

`src/server.ts`, 127.0.0.1 only, token from the printed URL as `?token=` or `x-aimem-token`.

| Route | Effect |
|---|---|
| `GET /api/sessions` | Sessions with memory counts |
| `GET /api/sessions/:id` | Memories of one session |
| `DELETE /api/sessions/:id` | Delete a session and its memories |
| `DELETE /api/memories/:id` | Delete one memory |
| `GET /api/search?q=` | Hybrid search, 30 hits |
| `GET /api/export` | Download a backup |

## Planned directories

Each directory holds only a README until its issue is done.

| Directory | Issue |
|---|---|
| `workspace/desktop/` | Tauri desktop app (#1592) |
| `workspace/scripts/` | Binary build for release (#1593) |
| `workspace/src/mcp/` | MCP server (#1594) |
| `workspace/src/indexer/` | LLM summaries and memory updates (#1595) |
| `workspace/src/connection/` | Connection settings and CA bundle (#1596) |
| `workspace/src/tokenizers/` | Open-source subword tokenizers (#1597) |
| `workspace/src/install/` | Hook installation and akbun-taskq integration (#1598) |
| `workspace/bench/` | Search benchmark, decay and ANN (#1599) |
