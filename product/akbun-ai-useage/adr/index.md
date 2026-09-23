# ADR

Decision records for akbun-ai-useage in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Tauri tray app without a webview](2026-09-tauri-tray-only.md) - Rust and a native tray menu keep the binary near 7 MB, and the webview concern behind the Electron rule does not apply.
* [Local logs first, APIs only where needed](2026-09-usage-sources.md) - Tokens come from CLI logs, limits from where each tool keeps them, organization usage from Admin APIs.
* [Tray menu and a settings file instead of windows](2026-09-tray-menu-and-settings-file.md) - Numbers live in disabled menu items and settings in a JSON file, so there is no window.
* [Release and self update](2026-09-release-and-update.md) - tauri-action releases an unsigned arm64 dmg and the updater plugin reads a fixed per-product tag.
