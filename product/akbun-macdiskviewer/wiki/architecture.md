# Architecture

Tauri 2 macOS app with a Rust backend, a separate low-priority Rust scanner, and a plain HTML, CSS, and JavaScript WebView.

## Processes

| Process | Files | Responsibility |
| --- | --- | --- |
| Tauri backend | `src-tauri/src/` | Window IPC, read-only SQLite queries, Git discovery, scan lifecycle, terminal discovery, Finder, and macOS settings |
| Rust scanner | `scanner/src/main.rs` | Sequential filesystem walk and construction of the next SQLite index |
| WebView | `src/renderer/` | Disk browser, Git storage tab, filters, sorting, paging, scan status, and context menu |

The WebView has no Node.js access. `api.js` exposes only named Tauri commands and the scan-state event to the page.

## Scan flow

1. First start finds no completed index, starts the Rust scanner for `/` through `nice -n 10`, and requests `taskpolicy -b` for its PID.
2. The scanner opens one directory at a time and keeps pause and cancellation checkpoints without forced sleeps.
3. Files are inserted into `disk-index.next.sqlite` in bounded batches; directories are inserted after their children so recursive sizes are complete.
4. Rust writes newline-delimited JSON progress to stdout at most four times per second.
5. A completed database replaces the current index through a backup rename.
6. Tauri emits the completed scan state and the WebView reloads disk and worktree data.

The current database remains queryable during a rescan. Cancellation removes only the next database. Startup restores the backup if replacement was interrupted.

Tauri sends pause, resume, and cancel as newline-delimited JSON over the scanner's stdin. The scanner keeps reading control input on a separate thread, so cancel also releases a paused scan.

The scan stores allocated bytes from Unix filesystem blocks and logical bytes from file length. It does not follow symbolic links. It excludes `/Volumes`, `/dev`, `/Network`, the duplicate APFS data view, and system VM/update volumes.

## Disk query flow

`catalog_query` validates and bounds every input. A query selects direct children or all descendants, applies optional name search, orders by a fixed column map, and returns at most 500 rows.

The SQLite index keeps the full catalog outside the WebView heap. Path, parent, size, and modification indexes are built after traversal so each scanned row does not update four B-trees.

## Git storage flow

1. The completed disk index is queried for `.git` files and directories.
2. A `.git` directory identifies a regular repository; a pointer file resolves a linked worktree Git directory.
3. `commondir` identifies a linked worktree's source repository and `HEAD` identifies each branch.
4. The repository or worktree root row provides recursive allocated size, modification date, and descendant count.
5. The Git storage tab filters and sorts the bounded result without another filesystem traversal.

Invalid or stale Git markers are ignored.

## Tauri command surface

| Command or event | Purpose |
| --- | --- |
| `app_state` | Disk capacity, scan state, and completed-index metadata |
| `catalog_query`, `catalog_issues` | Validated disk rows and unreadable paths |
| `worktree_catalog` | Git repository and linked-worktree summary and rows |
| `scan_start`, `scan_pause`, `scan_resume`, `scan_cancel` | Control the Rust scanner process |
| `scan-state` | Progress and completion event |
| `terminals`, `show_in_finder`, `open_in_terminal` | Context actions |
| `open_full_disk_access` | Open macOS privacy settings |

## Terminal discovery

The backend searches application roots for `.app` bundles to depth three and reads each `Info.plist` with `plutil`. A terminal is recognized by a terminal-like name, bundle identifier, URL scheme, or shell-document support paired with a shell-like app name.

Ghostty, WezTerm, kitty, and Alacritty receive known working-directory arguments. Every other discovered terminal receives the selected directory as a macOS open event.

## Packaging

`npm run dist` builds the Tauri application and scanner for `aarch64-apple-darwin`. Tauri copies the scanner into `Resources/bin/akbun-macdiskviewer-scanner`. Development uses the native release binary under `scanner/target/release/`.
