---
type: Decision
title: Web UI, MCP and CLI share one operation registry and write the database directly
description: Every surface lists and calls the same named operations; live updates come from a revision counter.
tags: [architecture, mcp, ai]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-15T00:00:00Z }
---

# Web UI, MCP and CLI share one operation registry and write the database directly

## 결정

`ops.rs` defines every operation once (name, description, JSON schema, handler). The browser posts to `/api/op/<name>`, MCP exposes them as tools, and the CLI takes the same names with JSON or `key=value` input. Generic add, update and delete operations are generated from entity column specs. The CLI and MCP open SQLite themselves instead of calling the running server. Triggers bump a `rev` counter on every write and the browser polls it every 2 seconds.

## 이유

- An agent and a person must be able to do the same things. A separate agent API drifts from what the UI can do; one registry cannot.
- Agents work without `serve` running, and a stopped server never blocks an agent. SQLite WAL with a busy timeout makes concurrent writers safe at this scale.
- Polling one integer is simpler than server push across processes, and two seconds is fast enough to watch an agent work.
- Comments carry an author and a resolved flag so the person can leave requests on scenes and agents can close the loop, which is the main review workflow.
