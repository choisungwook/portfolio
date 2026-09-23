# Tauri tray app without a webview

## Decision

Built on Tauri and Rust with no window. The tray menu is native, and all logic is Rust in the `usage-core` crate. An earlier draft on Electron was replaced before the first release.

## Reason

- The binary has to be light. The release binary is about 7 MB, against roughly 90 MB for the Electron draft.
- The stack rules prefer Electron for tray-first apps and for apps that ship on several platforms, because Tauri renders its UI in each platform's own webview. This app renders nothing in a webview: Tauri's tray title and menu are native on macOS, Windows and Linux, so there is no per-platform UI to check.
- Tauri's updater plugin replaces the hand-rolled dmg swap the Electron draft needed.
- The sources are file parsing, one CLI call and a few HTTPS GETs. serde_json, chrono and ureq cover all of it, so no node library is missed.
