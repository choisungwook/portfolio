# Architecture

## Processes

There is no daemon. Every hook runs `aimem hook`, which opens the SQLite file, does one thing and exits. `aimem serve` is a separate, optional process for the web UI; both use WAL mode so they can write at the same time.

## Hook flow

`aimem hook --agent <name>` reads the hook JSON on stdin (`src/hook.ts`).

1. Open the store and replay `spool.jsonl` if it exists.
2. Normalise the event name: `SessionStart`/`agentSpawn` print context (preferring `summary` memories over raw observations for summarized sessions), `*Prompt*` stores the prompt, `PostToolUse` stores tool name, input and response (truncated to 2000 chars), `Stop` stores `last_assistant_message`, `SessionEnd` marks the session ended. After `Stop`/`SessionEnd`, `aimem index <session-id>` is spawned detached in the background when an indexer provider is configured (`src/indexer/`).
3. On any error, append the payload to `spool.jsonl`, warn on stderr and exit 0.

## Storage

One file, `$AIMEMORY_HOME/data/aimemory.db` (`src/store.ts`).

| Table | Content |
|---|---|
| `sessions` | id, agent, project (basename of cwd), start and end time |
| `memories` | session, kind (`prompt`, `tool`, `response`, `note`, `summary`), content, `digest` (unique, dedups double hook calls), `vec` (512 float32), `access_count`, `last_accessed`, `valid_until` |
| `memories_fts` | FTS5 over the tokenizer output, rowid = memory id |
| `memories_vec` | Optional `sqlite-vec` `vec0` virtual table (enabled automatically at `annThreshold`, default 100,000 rows) |
| `meta` | `tokenizer`: id of the tokenizer that built the index; `ca_bundle_saved`: `'1'` when an imported CA bundle is active; `ann_index`: `'sqlite-vec'` when ANN is active |

## Search

`search()` tokenizes the query once, then runs BM25 on `memories_fts` and cosine on `vec` (`src/vector.ts`, FNV-1a hashed term frequency; brute-force below `annThreshold`, `sqlite-vec` `vec0` ANN at or above it). Invalidated memories (`valid_until <= now`) are excluded unless `--all` is set. The two rankings are fused with RRF (k = 60) and multiplied by an access-aware recency decay (`effectiveHalfLife = halfLifeDays * (1 + log2(1 + access_count))` from `max(created_at, last_accessed)`). Returned hits increment `access_count` and update `last_accessed`.

## Tokenizer

`src/tokenizer.ts` and `src/tokenizers/hf-json.ts`. `builtin` splits by script: Latin words, CJK character bigrams, Hangul words plus bigrams. `hf-json` loads a local HuggingFace `tokenizer.json` (Unigram or BPE, e.g. Gemma 3 or XLM-RoBERTa) with no runtime dependency. `command` runs an external tokenizer with text on stdin and expects a JSON array or whitespace-separated tokens (an example SentencePiece Python adapter lives at `src/tokenizers/sentencepiece_command.py`). Changing it needs `aimem reindex`; the store warns when the stored id differs.

## HTTP API

`src/server.ts`, 127.0.0.1 only, token from the printed URL as `?token=` or `x-aimem-token`.

| Route | Effect |
|---|---|
| `GET /api/sessions` | Sessions with memory counts |
| `GET /api/sessions/:id` | Memories of one session |
| `DELETE /api/sessions/:id` | Delete a session and its memories |
| `DELETE /api/memories/:id` | Delete one memory |
| `GET /api/search?q=` | Hybrid search, 30 hits |
| `GET /api/ca-bundle` | Read active CA bundle status and parsed certificates |
| `PUT /api/ca-bundle` | Validate and import a PEM CA bundle (`{ pem }`) |
| `DELETE /api/ca-bundle` | Remove the imported CA bundle |
| `GET /api/export` | Download a backup |

## MCP server

`src/mcp/server.ts`, started with `aimem mcp` over stdio (`@modelcontextprotocol/sdk`). Exposes `search`, `recent`, `show_session`, and `add_note` with responses matching CLI `--json` (including `degraded: true` spool fallback on `search`). Delete is omitted so only humans delete memories.

## Planned directories

Each directory holds only a README until its issue is done.

| Directory | Issue |
|---|---|
| `workspace/desktop/` | Tauri desktop app (#1592) |
| `workspace/scripts/` | Binary build for release (#1593) |
