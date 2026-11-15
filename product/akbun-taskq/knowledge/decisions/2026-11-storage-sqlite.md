---
type: Decision
title: Store tasks in SQLite, not in markdown, JSON or YAML files
description: One SQLite file in WAL mode holds every table; plain files were rejected because of locking.
tags: [sqlite, storage]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-15T00:00:00Z }
---

# Store tasks in SQLite, not in markdown, JSON or YAML files

## 결정

Task state lives in one SQLite file opened with the built-in `node:sqlite` module in WAL mode. Only fact memory stays as markdown under `memory/`, because a person edits it and git tracks it.

## 이유

- Several workers, the API and the CLI write at the same time. Claiming a task must be atomic, and a file per task has no compare-and-set without a hand-written lock file protocol.
- A crash in the middle of rewriting a JSON or YAML file leaves a half-written queue. SQLite's journal makes each write all or nothing.
- The calendar, daily stats and history search are range queries and full text search. SQLite has indexes and FTS5; files would need a scan on every request.
- `node:sqlite` ships with Node 24, so the choice adds no native addon and CI needs no compiler.
- WAL lets the CLI read and write while `taskq run` holds the database open.
