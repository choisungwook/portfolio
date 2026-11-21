---
name: aimemory
description: Search and store long-term memory across coding sessions with the aimem CLI. Use when the user refers to earlier work ("last time", "what did we decide"), when you need context from a previous session, or when a decision worth remembering was just made.
---

# aimemory

`aimem` keeps a local SQLite memory of earlier agent sessions. Hooks record prompts, tool calls and replies automatically; you only read, and add a note when something is worth keeping.

## Read before you guess

Search with the words the user would have used. Queries work in Korean, English, Japanese and Chinese.

```bash
aimem search "sqlite backup" --project "$(basename "$PWD")" --json
```

- `degraded: true` in the result means the database was unavailable and only the spool was searched. Say so instead of trusting an empty result.
- `aimem show <session-id> --json` prints a whole earlier session when one hit is not enough.
- `aimem recent --limit 20 --json` lists the latest memories when you have no query yet.

## Write only what lasts

Add a note for decisions, conventions and the reason behind them. Do not add what the hooks already captured.

```bash
aimem add "Release notes must include the xattr bypass for unsigned builds" --project "$(basename "$PWD")"
```

## Rules

- Never delete memories unless the user asks; `aimem delete` is permanent.
- `aimem --help` lists every command, option and exit code.
