---
type: Decision
title: CLI first on the akbun-taskq stack, desktop later
description: Node 24 TypeScript without a build step and node:sqlite, CLI and web UI before a desktop shell.
tags: [stack, cli, desktop]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T00:00:00Z }
---

## Decision

aimemory uses the akbun-taskq stack: Node 24 runs TypeScript directly, storage is `node:sqlite`, and there are no runtime dependencies. The CLI is the primary surface because agents call it from hooks; the web UI (`aimem serve`) comes next, and the desktop app will be a Tauri window around the same server, as in akbun-taskq.

## Reason

Hooks run on every prompt and tool call, so the CLI must start fast and never need a running server. Sharing the taskq stack lets taskq call `aimem` directly and lets the desktop shell, release workflow and CA bundle handling be copied rather than designed again. The desktop shell was deferred because 0.1.0 had to fit a small budget.
