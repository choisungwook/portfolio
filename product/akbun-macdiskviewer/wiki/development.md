# Development

## Requirements

- macOS on Apple Silicon for the supported app and release build
- Node.js 24 for CI parity
- npm
- Rust stable toolchain

## Run

Install and start:

```bash
cd product/akbun-macdiskviewer/workspace
npm install
npm start
```

Starting with no index scans the real startup disk. Cancel from the window when a full scan is not part of the development task.

## Test

Run the JavaScript and Rust suites:

```bash
npm test
```

JavaScript tests cover worktree filtering, worktree sorting, and disk-size formatting. Rust tests cover scan exclusions, recursive directory size, files, directories, symbolic links, pause, cancel, transaction rollback, catalog queries, database replacement, terminal detection, and Git worktree discovery.

## Test policy

- Add or update a regression test in the same change whenever a core feature is added or its behavior changes.
- Reproduce a core-feature bug in a test before fixing it.
- Test observable output such as SQLite rows, process messages, and launch arguments.
- Run the complete `npm test` suite before handoff.

CI installs the Tauri Linux prerequisites, Rust stable, and caches both Rust workspaces. Unit tests do not open a desktop window.

## Data

Tauri stores the indexes under its application-data directory:

| File | Purpose |
| --- | --- |
| `disk-index.sqlite` | Last completed index, opened read-only |
| `disk-index.next.sqlite` | Scan in progress |
| `disk-index.backup.sqlite` | Recovery copy during replacement |

Deleting the current index causes a first-run scan on the next launch.

## Full Disk Access

macOS denies protected folders without user approval. The scan records those paths and still completes. In a packaged build, add `akbun-macdiskviewer.app` under System Settings, Privacy & Security, Full Disk Access. In development, add the terminal that launched `npm start`.

## Version and release

`workspace/package.json` is the only product version. Every workspace change requires a version bump: patch for fixes, minor for features.

The release workflow verifies both suites on pull requests. A master push tests, builds the Tauri arm64 application and scanner, creates `akbun-macdiskviewer-v<version>` only after the dmg succeeds, and creates the GitHub release.

The build is unsigned. Release notes must retain the `xattr -cr /Applications/akbun-macdiskviewer.app` instruction.

## Caveats

- A full startup-disk scan is I/O work even at low CPU priority. Pause is the immediate control when other work needs the disk.
- The scanner is deliberately sequential. Increasing concurrency can shorten a benchmark while making the computer less responsive.
- macOS has no universal terminal protocol. Unknown terminal apps receive a directory open event and may launch without changing directory.
- Rust writes and reads SQLite through bundled rusqlite. The WebView receives only bounded query results through Tauri commands.
