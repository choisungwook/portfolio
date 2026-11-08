# Development

## Build and run

The pages run as they are with no bundler; Rust compiles on `npm start`. A Rust toolchain (`rustup`) and Node are needed.

Run the app locally:

```bash
cd workspace
npm install
npm start
```

Run the page tests and the core crate tests. Neither needs an app binary, so both run on Linux too:

```bash
npm test
npm run test:rust
```

Build the unsigned arm64 dmg locally. The updater artifact needs the signing key, so pass it in:

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/akbun-screenshot.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run dist
```

## Release

The GitHub Actions workflow `.github/workflows/release-akbun-screenshot.yml` releases on every master push that touches `workspace/`:

1. Runs the tests on macos-latest.
2. tauri-action builds the app, creates the release `akbun-screenshot-v<version>` from `workspace/package.json`, and GitHub creates the tag with it.
3. Renames the dmg to `akbun-screenshot-<version>-arm64.dmg` so Electron 0.8.0 installs can update into it.
4. Appends the list of PRs that touched this product to the release notes.
5. Copies `latest.json` to the fixed tag `akbun-screenshot-updater`, which is what installed copies poll.

To ship a new version, bump `version` in `package.json` in the same PR as the change. tauri-action does not fail on a version that already exists; it republishes over it, so a forgotten bump ships nothing new while the run stays green. After merging, confirm with `gh release list` that the new version is there.

Pull requests touching `workspace/` or the workflow run a verify job on ubuntu: `npm test` and `cargo test -p screenshot-core`. The core crate has no tauri dependency, so this needs no GTK or WebKit packages.

The signing key is `~/.tauri/akbun-screenshot.key` with an empty password, stored in the `TAURI_SIGNING_PRIVATE_KEY_SCREENSHOT` secret. Losing it means installed copies can never update again.

## Caveats

- The default shortcut Cmd+Shift+4 collides with the macOS system screenshot shortcut. If the system keeps handling it, either disable the system shortcut in System Settings > Keyboard > Keyboard Shortcuts > Screenshots, or set a different accelerator in the app settings.
- The first capture needs Screen Recording permission for the app (or for the terminal that launched `npm start` during development). The Settings > Permissions tab shows the current status and opens the right System Settings pane. macOS applies the permission only at launch, so the app must be relaunched after granting it.
- The dmg is unsigned. The release notes carry the `xattr -cr` command that removes the quarantine attribute after installing.
- The tray icon is the 📷 emoji set as the tray title. If it ever renders poorly, replace it with a 16pt template png.
- Debug builds open the devtools on the editor and settings windows, which is where page errors show up first.
