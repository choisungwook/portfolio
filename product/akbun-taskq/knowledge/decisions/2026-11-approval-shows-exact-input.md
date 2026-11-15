---
type: Decision
title: Approval shows and stores the exact input, bound to a request id
description: The pending approval input is kept unmasked and unclipped in its own table until decided, decisions name a request id, and the API needs a per-start token.
tags: [approval, security, api]
generated: { by: claude-code/claude-haiku-5-5, at: 2026-11-15T05:17:04Z }
---

# Approval shows and stores the exact input, bound to a request id

## 결정

The exact tool input of a pending approval is stored unmasked and unclipped in its own table, `approvals.input`, and cleared when the request is decided or its run ends. The events table keeps only the masked, clipped copy. A decision names the request id of the task's single open request; any other id is refused with 409. The API requires a token generated at each start.

## 이유

- A masked or clipped command lets a harmless prefix hide the part that runs. A shell comment carrying a private key marker made the masked view show `aws s3 ls` while `aws iam delete-user` was the command that ran. An approval means something only when the user sees the bytes that will execute.
- The unmasked text lives in one table and only while the request is open, so logs, events and alerts never carry it. Clearing it on decision and on run end limits how long it is kept.
- Binding decisions to a request id stops a stale card or a double click from answering a later command. The earlier lookup answered "the latest request", which made that possible.
- The queue can be driven by any local process, including an agent session steered by a page it read, so binding to 127.0.0.1 does not identify the caller. The token is kept in memory only, so each start invalidates the previous one.
