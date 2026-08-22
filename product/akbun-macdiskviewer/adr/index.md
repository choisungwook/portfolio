# ADR

Decision records for akbun-macdiskviewer.

## Contents

- [Tauri for the macOS application shell](2026-08-tauri-shell.md) - Use the system WebView and a Rust command backend while preserving the separate low-priority scanner.
- [Electron for the macOS release](2026-08-electron-for-macos.md) - Superseded initial shell decision.
- [Low-impact scan into a replaceable SQLite index](2026-08-low-impact-scan.md) - Sequential low-priority traversal keeps the computer responsive and the catalog off the renderer heap.
- [Rust owns the full-disk scan](2026-08-rust-scanner.md) - Filesystem traversal, recursive aggregation, and SQLite writes remain isolated from the application shell.
- [Worktree storage is a separate indexed view](2026-08-worktree-storage.md) - Derive linked worktrees from the completed disk index without another full traversal.
- [Startup-disk boundaries](2026-08-startup-disk-boundaries.md) - Include macOS firmlinked data while excluding external volumes, duplicate APFS views, VM data, and links.
- [Discover terminal applications from bundle metadata](2026-08-terminal-discovery.md) - Installed apps determine the context menu instead of a fixed preference list.
- [Hand-written updater for an unsigned Electron build](2026-08-unsigned-self-update.md) - Superseded with the Electron shell.
