# Product Rules

## Core feature tests

- Add or update a regression test in the same change whenever a core feature is added or its behavior changes.
- A bug fix for a core feature must first reproduce the bug in a test.
- Test observable results rather than implementation text or private function source.
- Keep the full `npm test` suite passing before handoff.

Core feature coverage:

| Feature | Required test location |
| --- | --- |
| File traversal, exclusions, sizes, links, pause, cancel, SQLite writes | `workspace/scanner/src/main.rs` |
| Browse scope, search, sorting, pagination, metadata, issues | `workspace/src-tauri/src/catalog.rs` |
| Worktree discovery and Git metadata parsing | `workspace/src-tauri/src/worktrees.rs` |
| Terminal discovery and launch arguments | `workspace/src-tauri/src/terminals.rs` |
| Scan process lifecycle and database replacement | `workspace/src-tauri/src/scanner.rs` |
| Worktree screen filtering, sorting, and formatting | `workspace/test/view-model.test.js` |

Documentation, formatting, and visual-only changes do not require a new test unless they change executable behavior.
