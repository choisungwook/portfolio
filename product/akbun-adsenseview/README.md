# akbun-adsenseview

Local-only macOS desktop app that shows Google AdSense earnings by site, by page and by URL channel. It runs from `cargo tauri dev` or `cargo tauri build` on your own machine: there is no release, no signing and no updater.

The window is a sidebar and a main panel. The sidebar picks the grouping, the period and the top N. The main panel shows totals, a daily earnings bar chart and a table of the top N sorted by earnings with page RPM. When grouped by page, a second table sums the pages by domain.

Every number comes from the AdSense Management API v2 `accounts.reports.generate` call and is cached in SQLite. Days older than `settleDays` (7 by default) are read from the cache once fetched; newer days are always refetched because AdSense keeps adjusting them. The toolbar shows how many days came from the API and how many from the cache.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/` | The page. Svelte and TypeScript, built by Vite. It only invokes Tauri commands and sums the rows it gets back |
| `workspace/src-tauri/src/` | The Rust side: OAuth, the AdSense client, settings and the command surface |
| `workspace/src-tauri/crates/cache/` | The cache rules and the SQLite store. No Tauri dependency, so it is tested on plain cargo |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Module responsibilities

| Module | Responsibility |
|---|---|
| `crates/cache/src/plan.rs` | Which days must go to the API: unsettled days always, settled days only when never fetched. Groups them into contiguous ranges |
| `crates/cache/src/store.rs` | Tables `daily` and `fetched`. Replaces a date range in one transaction and marks it fetched even when empty |
| `src-tauri/src/auth.rs` | OAuth 2.0 installed-app flow with a loopback listener, token.json, refresh |
| `src-tauri/src/adsense.rs` | `accounts.list` and `reports:generate`, response parsing, error classification |
| `src-tauri/src/settings.rs` | The config directory and settings.json (`settleDays`, currency) |
| `src-tauri/src/commands.rs` | The commands the page calls. `load_report` runs the cache rule end to end |
| `src/lib/aggregate.ts` | Totals, daily sums, top N, RPM, domain rollup, all in the page |

## Google Cloud setup

1. Create or pick a project in Google Cloud Console.
2. Enable **AdSense Management API** under APIs & Services > Library.
3. Configure the OAuth consent screen. External is fine; add your own Google account as a test user while the app is in testing.
4. Create credentials: OAuth client ID, application type **Desktop app**.
5. Download the JSON and save it as `client_secret.json` in the app config directory:

```text
~/Library/Application Support/io.akbun.adsenseview/client_secret.json
```

The directory is created on first launch, and the Config folder button opens it. The file is read from disk on every sign-in and never bundled into the app.

The requested scope is `https://www.googleapis.com/auth/adsense.readonly`. The first account from `accounts.list` is used.

## Run

Development needs a Rust toolchain and node. `tauri dev` starts Vite and compiles the Rust side.

Install and run:

```bash
cd workspace
npm install
npm start
```

Build an unsigned `.app` under `src-tauri/target/release/bundle/macos/`:

```bash
npm run dist
```

Run the cache tests, which need neither a webview nor a Google account:

```bash
npm run test:rust
```

Type-check the page:

```bash
npm run check
```

## Where to change SETTLE_DAYS

- At runtime: the Settle days field at the bottom of the sidebar, saved to `settings.json` in the config directory.
- The default: `DEFAULT_SETTLE_DAYS` in `workspace/src-tauri/src/settings.rs`.

Clear cache in the toolbar drops every cached row and fetched mark, so the next load refetches the whole period.

## Files in the config directory

| File | Content |
|---|---|
| `client_secret.json` | The OAuth desktop client you downloaded. Never written by the app |
| `token.json` | Access and refresh token, plain JSON. Sign out deletes it |
| `settings.json` | `settleDays` and the account currency |
| `cache.sqlite` | Tables `daily` and `fetched` |
