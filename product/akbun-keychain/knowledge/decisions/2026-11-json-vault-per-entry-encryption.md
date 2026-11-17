---
type: Decision
title: Store the vault as one readable JSON file with per-entry encryption and a lock file
description: Metadata is plaintext and authenticated, values are encrypted one by one; SQLite and a single encrypted blob were rejected.
tags: [storage, crypto, json]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

All secrets live in `vault.json`. Names, descriptions, tags and access levels are plaintext; each value is encrypted separately with AES-256-GCM, with the entry's metadata as additional authenticated data. An HMAC over the set of entries detects removal and replacement. Writers take `vault.lock` (exclusive create, stale takeover by pid and age) and replace the file by temp write, fsync and rename. Readers take no lock.

## 이유

- The data is a few dozen small records, read whole and written whole. A database would add a native dependency or a runtime-specific module to solve a problem a rename already solves.
- The file had to be readable by a person. One encrypted blob hides which keys exist; per-entry encryption shows the inventory and hides only the values.
- Readable is not the same as editable. The access level sits next to the value, so metadata is authenticated: without that, anything able to write the file could change `deny` to `reveal`. The cost is that a hand edit breaks the entry, and the documentation says so.
- SQLite was rejected for the reason above and because the file would stop being readable. [akbun-taskq chose SQLite](../../../akbun-taskq/knowledge/decisions/2026-11-storage-sqlite.md) because many writers update many rows concurrently; this vault has rare, small, whole-file writes.
- An OS file lock (`flock`, `LockFileEx`) was rejected: Node exposes neither, and the two differ across platforms. An exclusive-create lock file behaves the same on all three.
- Cost: every write rewrites the file, and a whole-file rollback to an older copy is not detected.
