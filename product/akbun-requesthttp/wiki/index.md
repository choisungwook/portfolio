# akbun-requesthttp wiki

Read this before changing anything.

| Page | What it covers |
|---|---|
| [architecture.md](./architecture.md) | Process structure, the state model, the two engines, key flows |
| [development.md](./development.md) | Build, run, test, release, the updater signing key, the web deploy, caveats |

The one-paragraph version: one plain HTML/JS page is the whole app, and it runs in two shells. Under Tauri, requests go through a Rust command (no CORS, TLS verification can be off) and state is a JSON file. Under a Cloudflare Worker, the same page is served as static assets and requests go through the worker's `/api/proxy`. All logic that can live without the DOM is in `src/lib.js` and `worker/proxy.js`, which is what CI tests — no webview, no binary.
