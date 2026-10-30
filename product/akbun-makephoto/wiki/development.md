# Development

## Run

Run the app in development:

```bash
cd workspace
npm install
npm start
```

To keep your own catalog out of an experiment, point both the app and the CLI at another file:

```bash
MAKEPHOTO_CATALOG=/tmp/test-catalog.json npm start
```

Run the CLI from source without building the app:

```bash
npm run cli -- list
```

## Test

Run the page logic tests (undo history, crop math, filters) in node:

```bash
npm test
```

Run the core and CLI tests. They need neither tauri nor a webview, which is why CI can run them on Linux:

```bash
npm run test:rust
```

The HEIC test runs only on macOS. The auto-level tests are sensitive to the confidence threshold; change it only with new measurements.

## Build

`tauri build` signs updater artifacts and fails without the private key. For a local app without it:

```bash
npm run build:app
```

The bundle is `src-tauri/target/debug/bundle/macos/akbun-makephoto.app`. Its binary is also the CLI: `.../Contents/MacOS/akbun-makephoto info`.

## Release

- The version lives only in `workspace/package.json`; tauri.conf.json points at it. Bump it in any PR that touches `workspace/`, or tauri-action republishes the old version over itself and nobody is told.
- `.github/workflows/release-akbun-makephoto.yml` runs tests on pull requests and builds, releases and publishes `latest.json` to the fixed `akbun-makephoto-updater` tag on master.
- Secrets: `TAURI_SIGNING_PRIVATE_KEY_MAKEPHOTO` and `TAURI_SIGNING_PRIVATE_KEY_MAKEPHOTO_PASSWORD`. The key and its password are backed up in `~/.tauri/akbun-makephoto.key*` on the maintainer's Mac. Losing the key means installed copies can never update again.

## Traps

- A page script must not declare top-level names another script also declares; everything hangs off `window.mp`, pure helpers off `makephotoLib`.
- The CSP has no `media-src`; there is no video. `img-src` needs `blob:` for previews and `asset:` for thumbnails.
- Tauri commands without `async` run on the main thread. Every command here is `async` so a RAW decode never freezes the window.
- `sips` has no `--`; paths are made absolute before calling it so a file named `-x.raf` is not read as a flag.
- Thumbnails are named by a hash of the edit and the original's size and time. `DefaultHasher` is not stable across Rust versions, so an update may regenerate them once. That is harmless.
