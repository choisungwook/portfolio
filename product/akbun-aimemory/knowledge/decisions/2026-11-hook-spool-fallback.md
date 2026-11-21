---
type: Decision
title: Hooks spool to a file and always exit 0
description: A broken store must never block the agent; events go to spool.jsonl and are replayed by the next good run.
tags: [hook, fallback, reliability]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T00:00:00Z }
---

## Decision

`aimem hook` catches every error, appends the raw payload to `$AIMEMORY_HOME/spool.jsonl` and exits 0. The next run that opens the database claims the spool by renaming it and replays it with the original timestamps. `aimem search` falls back to a substring scan of the spool and reports `degraded: true`.

## Reason

A hook that fails or hangs stops or slows the agent on every prompt, which is worse than losing memory. An append-only file needs nothing but a writable home, and the rename claim keeps two concurrent hooks from replaying the same lines. The `degraded` flag lets an agent tell an empty result from an unavailable store.
