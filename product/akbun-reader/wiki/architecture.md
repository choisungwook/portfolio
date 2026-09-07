# Architecture

One Worker, one D1 database, one hostname. Every client goes through the API; nothing talks to D1 directly.

## Components

| Component | Role | Status |
| --- | --- | --- |
| Worker `worker/index.ts` | Serves `/api/*`, `/automation/*`, `/mcp`, and unauthenticated `/public/*`; everything else falls through to the assets binding | Implemented |
| Cron Trigger | Every 15 minutes, refreshes up to four RSS feeds not fetched in the last 55 minutes | Implemented; live run pending |
| Assets `src/` | Plain HTML, CSS, and JavaScript. No bundler, so the source is what runs | Implemented |
| D1 | Documents, tags, change log, API tokens, RSS feeds and items, public shares | Local migration and APIs implemented |
| Cloudflare Access | Google login in front of the hostname, one allowed account | Not configured |
| iOS Shortcut | Share-sheet shortcut that POSTs the URL with a Bearer token | Configuration guide; device verification pending |
| Rust CLI | Login, document commands, Markdown export, CSV import | Implemented; live login verification pending |
| MCP endpoint | Streamable HTTP under `/mcp`, same Bearer tokens | SDK/workerd tested; live client verification pending |

## Request routing

`run_worker_first` includes `/api/*`, `/automation/*`, `/mcp`, and `/public/*`. A request for a static file never reaches the Worker, which keeps the free-tier request count down and means the page keeps working while the Worker is broken.

## Authentication, two paths

| Path | Who | Verified by |
| --- | --- | --- |
| Browser | The web page | Access issues a JWT after Google login; the Worker checks its signature and audience |
| Automation | Shortcut, CLI, MCP client | `Authorization: Bearer` token, stored in D1 as a hash |
| Public | Anyone with a share link | No identity. `/public/<id>` only checks that the 32-hex id exists in `shares`; Access must bypass this path |

Both paths end in Worker code. Trusting Access alone leaves the Worker open to anyone who reaches it without going through Access, which is why `workers_dev` and `preview_urls` are off in `wrangler.json`. Tokens are shown once at creation and revoked individually from the settings page.

## Data model

| Table | Purpose |
| --- | --- |
| `documents` | Source of truth. `normalized_url` is unique so a re-shared page maps to the same row |
| `documents.tags_json` | Tags replaced atomically with the document version; global tags use json_each |
| `changes` | Append-only log with a monotonic `seq`; clients sync by asking for rows after their last applied `seq` |
| `api_tokens` | Hash, name, creation, and revocation for automation tokens |
| `feeds`, `feed_items` | RSS subscriptions and collected entries, unique per feed and guid, 500 kept per feed; items join `documents` by normalized URL |
| `shares` | One public link per tag or feed. Deleting the row is what revokes the link |

The changes endpoint delivers ten changes per page. A delete trigger records database deletions; no document-delete API is exposed. Missing documents are exported as tombstones with local notes retained.

## Save flow

1. Automation client POSTs `{url, tags}` to `/automation/documents` with a Bearer token; the browser uses `/api/documents`.
2. Worker normalizes the URL (`worker/lib/normalize-url.js`) and looks for an existing row.
3. New URL: store metadata immediately; a DB trigger writes the create change in the same transaction.
4. In waitUntil, fetch bounded HTML and extract text for URL-only saves. Update extraction status and keep the original link on failure.
5. Run summary and tag suggestion after extraction so the shortcut never waits on the model API.

Extraction failure still saves the URL and title. The free-tier CPU budget per request is 10 ms, so the extractor choice is decided by measurement, not preference.

## Sync by change number

Each write appends to `changes`. The CLI keeps the last applied `seq` in the vault and requests only later rows. Files are named by document id so a title change does not rename the file, and the region below a separator is left for the user's own notes. Edits made in Obsidian do not flow back; D1 stays the source of truth.
