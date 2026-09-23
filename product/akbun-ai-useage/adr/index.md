# ADR

Decision records for akbun-ai-useage in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Electron menu bar app](2026-09-electron-menu-bar.md) - Chose Electron over Tauri because the tray is the whole UI and Windows and Linux are planned.
* [Local logs first, APIs only where needed](2026-09-usage-sources.md) - Tokens come from CLI logs, limits from where each tool keeps them, organization usage from Admin APIs.
* [Tray menu and a settings file instead of windows](2026-09-tray-menu-and-settings-file.md) - Numbers live in disabled menu items and settings in a JSON file, so there is no renderer.
* [Release and self update](2026-09-release-and-update.md) - package.json drives the tag, an unsigned arm64 dmg ships, and the dmg swap is ported from akbun-screenshot.
