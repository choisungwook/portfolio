# Architecture

## Process structure

One Electron main process and no renderer. The tray is the whole UI: a title on macOS, a drawn dot and a tooltip on Windows and Linux, and a context menu of disabled items that carry the numbers. There is no preload and no IPC.

| File | Role |
|---|---|
| `src/main.js` | Tray, menu, refresh timer, update dialogs. The only file that imports electron |
| `src/collect.js` | Runs each enabled source and returns one section per source |
| `src/claude.js` | Claude Code log parser, token lookup, OAuth usage endpoint |
| `src/codex.js` | Codex rollout parser, tokens and rate limits |
| `src/kiro.js` | Runs `kiro-cli chat /usage` and parses the card |
| `src/admin.js` | Anthropic and OpenAI Admin API usage and cost |
| `src/tokens.js` | Record shape and today, 7 day, 30 day aggregation |
| `src/format.js` | Title and menu lines |
| `src/scan.js` | Directory walk and per-file parse cache |
| `src/settings.js` | settings.json with defaults |
| `src/update.js` | GitHub Releases check and dmg swap, ported from akbun-screenshot |

## Refresh flow

1. `refresh()` rereads settings.json, so edits apply on the next refresh.
2. `collect()` runs all sources in parallel. A failing source returns a section with `error`, and the others still show.
3. `formatTitle()` builds the menu bar text and `buildMenu()` rebuilds the menu.
4. A timeout schedules the next refresh after `refreshMinutes`.

## Record shape

Every token source becomes `{ ts, input, output, cacheRead, cacheWrite, usd? }`. `input` excludes cached input, so the four token fields add up to the provider's count. OpenAI counts cached input inside `input_tokens`, so Codex and OpenAI parsers subtract it. Reasoning tokens stay inside `output`.

## Data sources

Claude Code writes one JSON line per message under `<config>/projects/`. Lines with `type: "assistant"` carry `message.usage`. A resumed session logs old messages again, so records are deduped on `message.id` plus `requestId`. `CLAUDE_CONFIG_DIR` overrides the config directories, comma separated.

Claude limits come from `GET https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth token, `anthropic-beta: oauth-2025-04-20` and a `claude-code/*` User-Agent. The response has `five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus` with `utilization` and `resets_at`. The token is read from `CLAUDE_CODE_OAUTH_TOKEN`, `.credentials.json`, then the macOS keychain item `Claude Code-credentials`.

Codex writes `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl`. Events with `payload.type: "token_count"` carry `info.last_token_usage`, `info.total_token_usage` and `rate_limits.primary` and `secondary`. The same event repeats when nothing was billed, so a record is kept only when the session total changes. The newest `rate_limits` across all files wins.

Kiro has no local log. `kiro-cli chat /usage --no-interactive --wrap never` prints a card with `Estimated Usage | resets on <date> | <plan>`, `Credits (<used> of <limit> covered in plan)` and a percent bar. ANSI codes are stripped before parsing.

The Admin APIs return daily buckets from 30 days ago, UTC. Anthropic uses `/v1/organizations/usage_report/messages` and `/cost_report`, where cost is a decimal string in cents. OpenAI uses `/v1/organization/usage/completions` and `/costs`, where cost is in dollars.

## Parse cache

`scan.js` keeps a Map per source keyed by file path. A file is reparsed only when its mtime or size changes, and files older than 31 days are not listed. Without it every refresh would reread hundreds of MB of logs.
