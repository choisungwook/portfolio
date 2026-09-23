# Architecture

## Process structure

One Tauri process with no window. The tray is the whole UI: a title on macOS and Linux, the app icon and a tooltip on Windows, and a native menu of disabled items that carry the numbers. `src/index.html` exists only because Tauri requires a `frontendDist`; no webview is ever created, so there are no commands, no IPC and no capabilities.

| Path | Role |
|---|---|
| `src-tauri/src/lib.rs` | Tray, menu, refresh thread, update dialogs. The only code that uses tauri |
| `src-tauri/crates/core/src/collect.rs` | Runs each enabled source and returns one `Section` per source |
| `src-tauri/crates/core/src/claude.rs` | Claude Code log parser, token lookup, OAuth usage endpoint |
| `src-tauri/crates/core/src/codex.rs` | Codex rollout parser, tokens and rate limits |
| `src-tauri/crates/core/src/kiro.rs` | Runs `kiro-cli chat /usage` and parses the card |
| `src-tauri/crates/core/src/admin.rs` | Anthropic and OpenAI Admin API usage and cost |
| `src-tauri/crates/core/src/tokens.rs` | `Record` and today, 7 day, 30 day aggregation |
| `src-tauri/crates/core/src/format.rs` | Title and menu lines |
| `src-tauri/crates/core/src/scan.rs` | Directory walk and per-file parse cache |
| `src-tauri/crates/core/src/settings.rs` | settings.json with defaults |

## Refresh flow

1. A worker thread started in `setup` owns a `Collector` with the parse caches.
2. Each round it rereads settings.json, runs `collect()`, and hands the sections to the main thread with `run_on_main_thread`, which sets the title, tooltip and a rebuilt menu.
3. It then waits on a channel for `refreshMinutes`. Refresh Now sends on that channel to wake it early.
4. A failing source returns a `Section` with `error`, and the others still show.

The run loop calls `prevent_exit` on an `ExitRequested` without a code, because a windowless app is always in the "all windows closed" state. Quit calls `app.exit(0)`.

## Record shape

Every token source becomes `Record { ts, input, output, cache_read, cache_write, usd }`. `input` excludes cached input, so the four token fields add up to the provider's count. OpenAI counts cached input inside `input_tokens`, so the Codex and OpenAI parsers subtract it. Reasoning tokens stay inside `output`.

## Data sources

Claude Code writes one JSON line per message under `<config>/projects/`. Lines with `type: "assistant"` carry `message.usage`. A resumed session logs old messages again, so records are deduped on `message.id` plus `requestId`. `CLAUDE_CONFIG_DIR` overrides the config directories, comma separated.

Claude limits come from `GET https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth token, `anthropic-beta: oauth-2025-04-20` and a `claude-code/*` User-Agent. The response has `five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus` with `utilization` and `resets_at`. The token is read from `CLAUDE_CODE_OAUTH_TOKEN`, `.credentials.json`, then the macOS keychain item `Claude Code-credentials`.

Codex writes `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl`. Events with `payload.type: "token_count"` carry `info.last_token_usage`, `info.total_token_usage` and `rate_limits.primary` and `secondary`. The same event repeats when nothing was billed, so a record is kept only when the session total changes. The newest `rate_limits` across all files wins.

Kiro has no local log. `kiro-cli chat /usage --no-interactive --wrap never` prints a card with `Estimated Usage | resets on <date> | <plan>`, `Credits (<used> of <limit> covered in plan)` and a percent bar. ANSI codes are stripped before parsing, and the run is killed after 30 seconds.

The Admin APIs return daily buckets from 30 days ago, UTC. Anthropic uses `/v1/organizations/usage_report/messages` and `/cost_report`, where cost is a decimal string in cents. OpenAI uses `/v1/organization/usage/completions` and `/costs`, where cost is in dollars.

## Parse cache

`ParseCache` maps a file path to its mtime, size and parsed value. A file is reparsed only when either changes, and files not modified in 31 days are not listed. Without it every refresh would reread hundreds of MB of logs.
