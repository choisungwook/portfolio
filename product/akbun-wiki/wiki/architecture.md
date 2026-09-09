# Architecture

One process, one data directory, two credentials. The reader stays the source of truth for documents; this service owns only derived data.

## Data flow

1. `wiki sync` asks the reader for change-log rows after the last applied sequence number, ten per page, with a read-only Bearer token.
2. Every row becomes `raw/<document id>.md` with frontmatter (title, url, tags, location, saved_at, reader_id) and the extracted body. A deleted document removes its file.
3. After each page lands on disk the sequence number is saved to SQLite, so an interrupted run re-applies that page and skips nothing.
4. When any file changed, `graphify extract raw` builds `raw/graphify-out/graph.json` and `graphify export wiki` writes `raw/graphify-out/wiki/`.
5. The wiki files are read into the `articles` table and its FTS5 mirror in one transaction. Slugs are file stems; titles are the first H1.
6. `wiki serve` answers `/api/*` from SQLite. Nothing reads the wiki files at request time.

## Components

| Component | Role |
| --- | --- |
| `reader_client.py` | Pages the change log; a row without an id is a deletion |
| `raw_store.py` | Writes each document atomically and only when the content differs |
| `sync.py` | Drives paging and saves the sequence number per page |
| `builder.py` | Runs the two graphify commands and indexes the wiki |
| `index_store.py` | SQLite: `state`, `api_keys`, `articles`, `articles_fts` |
| `api.py` | FastAPI routes, Bearer key check, admin-only sync |
| `cli.py` | `sync`, `build`, `serve`, `keys create|list|revoke` |

## Storage

| Path | Content | Rebuilt by |
| --- | --- | --- |
| `raw/*.md` | Mirror of reader documents | `wiki sync` |
| `raw/graphify-out/` | graph.json, cache, and `wiki/` | `wiki build` |
| `wiki.db` | Sync state, API keys, article index | Keys and state persist; articles are replaced on every build |

The wiki is files first because graphify reads and writes folders and an LLM or Obsidian can open them directly. SQLite exists so the API can search without touching the filesystem and so keys survive a rebuild.

## Two credentials

| Credential | Held by | Verified by | Can do |
| --- | --- | --- | --- |
| Reader read-only token | This service, in `READER_TOKEN` | The reader Worker | GET on `/automation/*`; writes and MCP answer 403 |
| Wiki API key | LLM clients and the scheduler | This service, SHA-256 hash in `api_keys` | `read`: articles, search, status. `admin`: also `POST /api/sync` |

Keys are shown once at creation and revoked by id. There is no user database beyond the key table: the owner issues keys from the CLI on the machine that runs the service.

## API

| Request | Content |
| --- | --- |
| GET /health | No auth, liveness only |
| GET /api/status | Last reader sequence, sync and build times, article count |
| GET /api/articles | Slug, title, updated_at for every article |
| GET /api/articles/{slug} | One article with its markdown body |
| GET /api/search?q= | FTS5 match ordered by rank, snippet with brackets around hits |
| POST /api/sync | Admin only. Sync, then build when files changed or no wiki exists. 502 when the reader or graphify fails |

Every authenticated response carries `Cache-Control: no-store`. Errors are `{"error": "..."}`.
