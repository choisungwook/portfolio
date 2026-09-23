# Development

## Run

Start the app from source. Rust stable is required, and on Linux the Tauri system packages (WebKitGTK, libayatana-appindicator):

```bash
cd workspace
npm install
npm start
```

## Test

All logic lives in the `usage-core` crate, which does not depend on tauri, so its tests need no system packages:

```bash
npm test
```

What the tray would show on this machine, without Tauri:

```bash
cargo run --manifest-path src-tauri/Cargo.toml -p usage-core --example print
```

## Release

1. Bump `version` in `workspace/package.json` in the same PR as the change. The workflow also bumps the patch past the latest tag if it was forgotten.
2. A PR runs the `verify` job on ubuntu: `cargo test -p usage-core` only.
3. A master push runs `release` on macOS: tauri-action builds the arm64 dmg and updater artifacts, creates the release and tag `akbun-ai-useage-v<version>`, and the manifest is copied to the fixed tag `akbun-ai-useage-updater`.
4. Check `gh run list --workflow=release-akbun-ai-useage.yml` and `gh release list` after merging.

Secrets: `TAURI_SIGNING_PRIVATE_KEY_AIUSEAGE` and `TAURI_SIGNING_PRIVATE_KEY_AIUSEAGE_PASSWORD` (empty). Losing the key means installed copies can never update again; keep a copy outside GitHub. The matching public key is in `tauri.conf.json`.

## Caveats

- The OAuth usage endpoint and the Codex and Kiro formats are undocumented. When a number disappears, compare a fresh log line or CLI output against the parser first.
- Claude limits are off by default. They reuse the Claude Code login token, and macOS may ask for keychain access on the first refresh.
- The Admin API buckets start at UTC midnight while "Today" starts at local midnight, so org "Today" is off by the timezone offset.
- `kiro-cli` is looked up with `~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin` added to PATH, because a Finder launch gets a bare PATH. Set `kiro.command` to an absolute path if it lives elsewhere.
- settings.json holds admin keys in plain text with mode 0600.
- The release profile trades build time for size: LTO, one codegen unit, `opt-level = "s"`, stripped. A release build takes about 4 minutes.
- Windows and Linux: the code builds and the Linux binary starts under Xvfb, but no installer ships. Shipping Windows means an NSIS target with `installMode: "currentUser"` and `updaterJsonPreferNsis: true`.
