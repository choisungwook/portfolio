---
type: Decision
title: Move from Electron to Tauri because the dmg was 113 MB
description: The app moved to Tauri 2 with the pages kept as they were, the updater became the official plugin, and the release still carries an -arm64.dmg so Electron installs can cross over.
tags: [tauri, rust, update, release]
timestamp: 2026-11-08T00:00:00Z
---

# Move from Electron to Tauri because the dmg was 113 MB

## Decision

Rewrite the main process in Rust on Tauri 2 and keep the three pages. A `src/api.js` bridge exposes the same `window.api` the Electron preload did, so editor, preview and settings changed only where Electron leaked through: the preview loads its image as a data URL, the font list comes from a command, and the drag region is `data-tauri-drag-region`.

The pure helpers live in `src-tauri/crates/core`, which depends on neither tauri nor a webview. The updater is `tauri-plugin-updater` polling the fixed tag `akbun-screenshot-updater`, the same arrangement akbun-makepresentation uses. The release workflow renames the dmg to `akbun-screenshot-<version>-arm64.dmg`.

This supersedes [Electron with native screencapture](./2026-07-electron-native-screencapture.md) on the runtime and [Update by dmg download and bundle swap](./2026-07-update-download-and-swap.md) on the updater. Capture by the screencapture binary stays.

## Reason

The Electron dmg for 0.8.0 was 113 MB for an app whose real work is four lines that run `screencapture`. The Tauri dmg is 2.6 MB and the app 5.2 MB. The July decision weighed runtime speed and correctly found it did not matter; it did not weigh download size, which is what users notice on every update.

The July reasons against Tauri no longer hold either. The repository now has working Tauri products and a proven tauri-action release with a signed updater, so there is no new pipeline to build for one app.

Keeping the pages was the cheapest way to keep behaviour. The editor holds most of the product's subtlety (undo stack, crop box, handles) and none of it touched Electron, so a bridge with the old method names moved it over untouched.

The dmg rename is for the installs already out there. An Electron 0.8.0 copy picks a dmg whose name contains `-arm64.`, mounts it, and swaps in whatever `.app` it finds. tauri-action names the file `_aarch64.dmg`, which that filter skips, and those users would be stuck on Electron forever. With the rename, one Check for Updates moves them to Tauri, after which the plugin takes over.

Settings stay at `~/Library/Application Support/akbun-screenshot/settings.json`, the Electron path, rather than Tauri's identifier-named directory, so the crossover keeps the user's shortcut and save folder.

The updater signing key lives in `~/.tauri/akbun-screenshot.key` and the `TAURI_SIGNING_PRIVATE_KEY_SCREENSHOT` secret. Losing it means installed copies can never update again, so it is backed up outside GitHub.
