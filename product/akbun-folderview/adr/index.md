# ADR

Decision records for akbun-folderview in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Tauri over Electron](2026-08-tauri-over-electron.md) - An installer under 10 MB instead of 85 to 95 MB, paid for with a Rust backend and a development run that no longer uses the engine that ships.
* [The library is only what you add](2026-08-library-is-what-you-add.md) - No disk crawl and no database, because a hand-picked library fits in memory and a scan over it is already instant.
* [The asset protocol scope is granted at runtime](2026-08-asset-protocol-runtime-scope.md) - A bare `**` in the config does not match absolute paths, so each added folder is granted from Rust and granted again at start.
* [Settings and library in the user data folder](2026-08-settings-in-appdata.md) - `%APPDATA%` rather than Program Files, written through a temp file and a rename.
* [Keep one library per volume UUID](2026-08-library-by-volume-uuid.md) - A drive letter identifies a mount location, so roots, entries, metadata and thumbnail keys are separated by the stable Windows Volume GUID.
* [Native right click menu and Recycle Bin delete](2026-08-native-context-menu-and-recycle-bin.md) - The system draws the menu and each item runs its own action, delete is recoverable, and Copy means the path because the file clipboard format is out of reach.
* [The supported updater plugin](2026-08-updater-plugin-and-signing-key.md) - The hand-written updater had to be rewritten anyway, the signature is worth having, the key can never be lost, and the earlier claim that unsigned Windows builds cannot use a supported updater was wrong.
* [Release from the package.json version](2026-08-release-workflow.md) - One version field drives the release, the tag comes from the release, and a forgotten bump now fails silently in both directions.
* [The updater polls a fixed tag, not releases/latest](2026-08-updater-fixed-tag-endpoint.md) - releases/latest is repository-wide and any other product's release steals it, so the workflow copies latest.json to a tag only this product touches.
