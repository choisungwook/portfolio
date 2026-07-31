# Development

## Build and run

There is no compile step; Electron runs the JavaScript sources directly.

Run the app locally:

```bash
cd workspace
npm install
npm start
```

Run the tests (pure functions and the update temp file cleanup, no Electron binary needed):

```bash
npm test
```

Build the unsigned arm64 dmg locally:

```bash
npm run dist
```

## Release

The GitHub Actions workflow `.github/workflows/release-akbun-screenshot.yml` releases on every master push that touches `workspace/`:

1. Reads `version` from `workspace/package.json`.
2. Runs the tests and builds the dmg on macos-latest (arm64, unsigned).
3. Creates the tag `akbun-screenshot-v<version>` and a GitHub release with the dmg attached.

To ship a new version, bump `version` in `package.json` in the same PR as the change. Pushing the same version twice fails at the tag step by design.

Pull requests touching `workspace/` run a verify job on ubuntu with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, so tests must stay runnable with plain node.

## Caveats

- The default shortcut Cmd+Shift+4 collides with the macOS system screenshot shortcut. If the system keeps handling it, either disable the system shortcut in System Settings > Keyboard > Keyboard Shortcuts > Screenshots, or set a different accelerator in the app settings.
- The first capture needs Screen Recording permission for the app (or for the terminal that launched `npm start` during development). The Settings > Permissions tab shows the current status and opens the right System Settings pane. macOS applies the permission only at launch, so the app must be relaunched after granting it.
- The dmg is unsigned. The release notes carry the `xattr -cr` command that removes the quarantine attribute after installing.
- The tray icon is the 📷 emoji set via `tray.setTitle`. If it ever renders poorly, replace it with a 16pt template png passed to the Tray constructor.
