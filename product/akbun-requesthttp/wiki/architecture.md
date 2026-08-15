# Architecture

## Process structure

One page, two shells:

- Desktop: a Tauri window loads `src/` directly (`frontendDist: ../src`, no bundler). Rust does the network and the disk.
- Web: a Cloudflare Worker serves `src/` as static assets and adds one endpoint, `POST /api/proxy`.

`src/api.js` is the only file that knows which shell is running. It detects `window.__TAURI__` and publishes `window.api` with the same surface either way. Everything above it — `app.js` for DOM glue, `lib.js` for logic — is shell-agnostic.

## State model

The page owns one state object and both shells persist it as an opaque JSON string:

```json
{
  "folders": [{ "id": "", "name": "", "isDefault": false, "requests": [{ "id": "", "name": "", "method": "GET", "url": "", "headers": [], "body": "", "localVariables": [] }] }],
  "globalVariables": [{ "key": "", "value": "" }],
  "settings": { "verifySsl": true, "timeoutSecs": 30, "followRedirects": true }
}
```

- Desktop storage: `state.json` in the app data directory, written write-then-rename so a crash cannot destroy bookmarks.
- Web storage: localStorage under `akbun-requesthttp-state`.
- Saves are debounced 300 ms in `app.js`; Rust and the worker never interpret the blob.
- `Default` always exists, cannot be deleted, and receives migrated flat requests and new requests with no chosen folder.

## The engine surface

Both engines take a resolved request spec plus engine settings and return the same response shape:

```json
{ "status": 200, "statusText": "OK", "headers": [{ "key": "", "value": "" }], "body": "", "elapsedMs": 0, "sizeBytes": 0 }
```

- Desktop: `send_request` in `src-tauri/src/commands.rs`, reqwest with rustls. `verifySsl: false` maps to `danger_accept_invalid_certs(true)`; that is why requests run in Rust at all — a webview could neither skip TLS verification nor escape CORS.
- Web: `worker/index.js` validates the spec (http/https only), fetches server side, and shapes the result with `worker/proxy.js`. TLS verification cannot be disabled in Workers, so `api.js` forces `verifySsl: true` on web and the settings dialog says so.

The IPC surface is three commands: `send_request`, `load_state`, `save_state`.

## Key flows

- Send: `app.js` resolves `{{variables}}` through `lib.js` (`resolveRequest`), hands the spec to `api.send`, renders the response. Request-local values override globals with the same name. Unknown variables stay visible as `{{name}}`.
- curl: `toCurl` renders the resolved request (adds `-k` when verification is off); `parseCurl` reads the common flag subset (`-X`, `-H`, `-d/--data*`, `--url`, `-A`) and imports into a fresh scratch request, never over a bookmark.
- `.http` import: the page reads the selected file, `parseHttpFile` splits requests at `###`, and the imported folder uses the full filename. File variables become request-local variables.

## Where logic lives

| File | Role | Tested by |
|---|---|---|
| `src/lib.js` | Folder migration, variables, curl/.http parsing, formatting | `test/lib.test.js` |
| `worker/proxy.js` | Spec validation and fetch mapping for the web engine | `test/proxy.test.js` |
| `src/app.js` | DOM glue only | Running the app |
| `src/api.js` | Shell detection, engine and storage bindings, updater | Running the app |
| `src-tauri/src/commands.rs` | reqwest adapter and state file | Compile + release build |

There is no pure Rust crate: the Rust side is an IO adapter with nothing to unit test, so pull request CI runs the node tests only.
