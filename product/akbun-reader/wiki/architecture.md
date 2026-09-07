# Architecture

One Worker, one D1 database, one hostname. Every client goes through the API; nothing talks to D1 directly.

## Components

| Component | Role | Status |
| --- | --- | --- |
| Worker `worker/index.ts` | Serves `/api/*`; everything else falls through to the assets binding | Implemented |
| Assets `src/` | Plain HTML, CSS, and JavaScript. No bundler, so the source is what runs | Implemented |
| D1 | Documents, tags, change log, API tokens | Local migration and APIs implemented |
| Cloudflare Access | Google login in front of the hostname, one allowed account | Not configured |
| iOS Shortcut | Share-sheet shortcut that POSTs the URL with a Bearer token | Planned |
| Rust CLI | Login, list, save, and incremental Markdown export to an Obsidian vault | Planned |
| MCP endpoint | Streamable HTTP under `/mcp`, same Bearer tokens | Planned |

## Request routing

`run_worker_first` is limited to `/api/*`. A request for a static file never reaches the Worker, which keeps the free-tier request count down and means the page keeps working while the Worker is broken. `/mcp` will be added to that list when it exists.

## Authentication, two paths

| Path | Who | Verified by |
| --- | --- | --- |
| Browser | The web page | Access issues a JWT after Google login; the Worker checks its signature and audience |
| Automation | Shortcut, CLI, MCP client | `Authorization: Bearer` token, stored in D1 as a hash |

Both paths end in Worker code. Trusting Access alone leaves the Worker open to anyone who reaches it without going through Access, which is why `workers_dev` and `preview_urls` are off in `wrangler.json`. Tokens are shown once at creation and revoked individually from the settings page.

## Data model

| Table | Purpose |
| --- | --- |
| `documents` | Source of truth. `normalized_url` is unique so a re-shared page maps to the same row |
| `documents.tags_json` | Tags replaced atomically with the document version; global tags use json_each |
| `changes` | Append-only log with a monotonic `seq`; clients sync by asking for rows after their last applied `seq` |
| `api_tokens` | Hash, name, last use, and revocation for automation tokens |

Deletion and sync delivery APIs remain future work; current changes are create and update records.

## Save flow

1. Client POSTs `{url, tags}` with a Bearer token.
2. Worker normalizes the URL (`worker/lib/normalize-url.js`) and looks for an existing row.
3. New URL: store the supplied body and metadata; a DB trigger writes the create change in the same transaction. URL body extraction remains #1212 work.
4. Respond, then run summary and tag suggestion asynchronously so the shortcut never waits on the model API.

Extraction failure still saves the URL and title. The free-tier CPU budget per request is 10 ms, so the extractor choice is decided by measurement, not preference.

## Sync by change number

Each write appends to `changes`. The CLI keeps the last applied `seq` in the vault and requests only later rows. Files are named by document id so a title change does not rename the file, and the region below a separator is left for the user's own notes. Edits made in Obsidian do not flow back; D1 stays the source of truth.
