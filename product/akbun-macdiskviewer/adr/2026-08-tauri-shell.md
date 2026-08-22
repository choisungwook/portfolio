# Tauri for the macOS application shell

## Decision

Use Tauri 2 for the macOS window and command boundary. Keep the scanner as a separate Rust executable launched with low OS priority, and reuse the plain HTML, CSS, and JavaScript renderer.

## Reason

The scanner already owns the performance-sensitive filesystem work. Tauri removes Electron's bundled Chromium and Node.js runtime while letting Rust own SQLite queries, process control, Finder actions, terminal discovery, and macOS settings. Keeping the scanner separate preserves pause, cancellation, low-priority scheduling, and failure isolation.
