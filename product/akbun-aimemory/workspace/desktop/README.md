# Desktop Shell (`akbun-aimemory`)

Tauri v2 macOS desktop window around `aimem serve --port 0`, reusing the `product/akbun-taskq/workspace/desktop` architecture.

- Launches the bundled `aimem` sidecar binary (`binaries/aimem`) inside the user's login shell and navigates the main window to the printed loopback URL (`http://127.0.0.1:<port>/?token=...`).
- Self-update uses `tauri-plugin-updater` + `tauri-plugin-dialog`, triggered from the native macOS menu item **Check for Updates…** and polling the fixed `akbun-aimemory-updater` release tag. The updater `pubkey` matches the repository's existing `TAURI_SIGNING_PRIVATE_KEY` secret (`A3A62A21AC95930D`).
- Version is read from `../../package.json` (`workspace/package.json`) so there is only one version to bump.
- Pure launch logic lives in `src-tauri/crates/launch` (`aimemory-launch`) with no Tauri dependency, so `npm test` runs without a webview or GTK/WebKit.
