---
type: Decision
title: Approval waits on a database row, woken by events
description: A pending approval is a database row, not an in-memory promise.
tags: [runner, approval]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
---

## 결정

When a worker asks for approval the runner writes an `approvals` row and reads its `decision` each time an event is written in this process, and otherwise every `pollSec` (60 s). The `permission_request`, `approved` and `denied` events are still written for the log. See [the wake signal decision](2026-11-wake-instead-of-poll.md). The row is where the decision is bound to one request id; see [the exact-input decision](2026-11-approval-shows-exact-input.md).

## 이유

- The CLI is a separate process. An in-memory promise could only be resolved through the HTTP server, so `taskq approve` would fail whenever it could not reach it.
- After a crash nothing is lost: the task is recovered as stale, the session resumes and asks again.
- A decision through the API writes an event and wakes the wait at once. Only a decision from the CLI waits up to a minute, which is acceptable next to a human decision.
