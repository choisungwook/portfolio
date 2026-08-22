# Electron for the macOS release

Status: Superseded by [Tauri for the macOS application shell](2026-08-tauri-shell.md).

## Decision

Build the window in plain JavaScript on Electron, move the scan engine to a bundled Rust executable, and ship macOS arm64 only.

## Reason

The product needs a macOS build now. Electron renders development and release with the same engine, and the repository already has a working unsigned macOS self-update implementation. The installer is larger than Tauri, but moving traversal and aggregation to Rust removes JavaScript from the performance-sensitive path without rewriting the finished window.
