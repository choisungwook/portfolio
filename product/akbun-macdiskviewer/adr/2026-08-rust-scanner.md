# Rust owns the full-disk scan

## Decision

Keep filesystem traversal, recursive size aggregation, throttling, and SQLite writes in a separate Rust executable. The Tauri Rust backend owns catalog queries and macOS integration while the WebView owns presentation only.

## Reason

A startup disk can contain millions of entries. The separate process can run through `nice`, pause immediately, be cancelled, and fail without taking down the Tauri window. Direct SQLite writes avoid transferring millions of entry objects through WebView IPC.
