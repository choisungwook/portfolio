# Development

## Prerequisites

- Rust stable and node 22 or newer
- A Google Cloud project with the AdSense Management API enabled and an OAuth desktop client, saved as `client_secret.json` in the config directory. Steps are in the README.

## Run

`npm start` runs `tauri dev`, which starts Vite on port 1420 and compiles the Rust side. Debug builds open the webview devtools on start.

`npm run dist` builds an unsigned `.app` under `src-tauri/target/release/bundle/macos/`. It is for this machine only.

## Test

`npm run test:rust` runs the cache crate tests: missing days, range grouping, upsert, empty-day marking, clear. The crate has no Tauri dependency, so the pull request job runs it on ubuntu without GTK or WebKit.

`npm run check` runs svelte-check, and `npm run build` runs Vite. Both run in the pull request job too.

There is no page test suite. The sums in `aggregate.ts` are small enough to read.

## Version

The version lives only in `workspace/package.json`; `tauri.conf.json` points at it. There is no release, so nothing enforces a bump, but keep bumping it when `workspace/` changes so the About line in the window says which build is running.

## Caveats

- Today's numbers are partial. The period presets end today on purpose, and today is always refetched.
- `settleDays` only decides refetching. Rows already in the cache are shown as they were fetched.
- The refresh token is stored as plain JSON in `token.json`. The scope is read-only and the file is in the user's own Library folder.
- Google marks a desktop client's secret as not confidential, which is why the loopback flow sends it and why it must not be committed anywhere.
- `dist/` must exist before `cargo check` on the Rust side, because `generate_context!` reads `frontendDist`. `npm run build` creates it.
- The page is checked on macOS's WebKit only. Nothing else is a target.
