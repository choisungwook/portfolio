# Architecture

## Process structure

One Tauri window. The page is Svelte compiled by Vite and served from `dist/`; in development Vite serves it on port 1420. The Rust side owns every rule: OAuth, the API calls, the cache and the settings. The page only invokes commands and sums the rows it receives.

```text
page (Svelte)                     Rust
  Sidebar / Summary / Chart        commands.rs  ── load_report ──▶ plan.rs (which days)
  aggregate.ts (sums, top N)  ◀──  ReportResult     │                 │
                                                    ▼                 ▼
                                               adsense.rs ──▶ store.rs (SQLite)
                                                    │
                                                 auth.rs (token)
```

## Key flow: load_report

1. The page sends `kind`, `start`, `end`.
2. `fetched_days` reads which days of that range were already asked of the API for this kind.
3. `missing_days` keeps every day newer than `today - settleDays` plus every settled day that is not in `fetched`. Days after today are dropped.
4. `group_ranges` collapses them into contiguous ranges. Each range is one `reports:generate` call.
5. Each answer replaces the rows of that range for that kind in one transaction and marks every day in the range fetched, including days that came back empty.
6. The rows for the whole range are read back from SQLite and returned with `apiDays` and `cacheDays`.

Site, page and channel are separate `kind` values, so they are fetched and cached independently.

## OAuth

`client_secret.json` is read from the config directory on every sign-in. `sign_in` binds a loopback port, opens the Google consent URL in the default browser through the opener plugin, and waits up to five minutes for the redirect. The code is exchanged for a token and saved as `token.json`. `access_token` refreshes when the token is within a minute of expiry. A refused refresh is returned as an `auth` error and the page shows the sign-in button again.

## Command surface

| Command | Returns |
|---|---|
| `get_status` | Signed in, client secret present, config dir, settle days, currency, version |
| `sign_in` | Status after the browser flow |
| `sign_out` | Status after deleting token.json |
| `load_report(kind, start, end)` | Rows, apiDays, cacheDays, currency |
| `clear_cache` | Nothing. Drops both tables |
| `save_settle_days(days)` | Status |
| `open_config_dir` | Nothing |

Errors are `{ kind, message }` with kind `auth`, `quota`, `setup` or `other`. 401 is auth, 429 or a 403 naming a quota is quota, a missing client_secret.json is setup.

## Storage

Everything is under `~/Library/Application Support/io.akbun.adsenseview/`. The SQLite schema is two tables, `daily(day, kind, name, earnings, page_views, clicks, impressions)` with a primary key on the first three, and `fetched(day, kind)`.

## Page

`aggregate.ts` holds totals, daily sums padded to every day in the range, grouping by name, top N and the domain rollup for page URLs. RPM is earnings per thousand page views. The chart is Chart.js with only the bar controller and the two scales registered.
