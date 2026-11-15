---
type: Decision
title: Approval waits by polling the events table
description: A pending approval is a database row, not an in-memory promise.
tags: [runner, approval]
generated: { by: claude-code/claude-haiku-5-5, at: 2026-11-15T05:17:10Z }
---

# Approval waits by polling the events table

## 결정

When a worker asks for approval the runner writes an `approvals` row and polls its `decision` once a second. The `permission_request`, `approved` and `denied` events are still written for the log, and the SSE stream polls the events table. The row is where the decision is bound to one request id; see [the exact-input decision](2026-11-approval-shows-exact-input.md).

## 이유

- The CLI is a separate process. An in-memory promise could only be resolved through the HTTP server, so `taskq approve` would fail whenever it could not reach it.
- After a crash nothing is lost: the task is recovered as stale, the session resumes and asks again.
- One second of latency is invisible next to a human decision, and polling a local indexed table costs nothing measurable.
