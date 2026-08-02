# Development

## Build and run

Development run (opens the app with devtools):

```bash
cd workspace
npm install
npm start
```

Release build for the current machine:

```bash
npm run dist
```

## Test

Page logic under node, no browser or app binary:

```bash
npm test
```

Model, pptx and pdf tests, no Tauri compile:

```bash
npm run test:rust
```

Opening `src/index.html` in a plain browser also works for poking at the editor; file operations degrade to no-ops there.

## Release

Push to master with changes under `product/akbun-makepresentation/` and the `release-akbun-makepresentation` workflow builds a macOS dmg, creates the `akbun-makepresentation-v<version>` release, and copies `latest.json` to the fixed `akbun-makepresentation-updater` tag the installed app polls.

Rules that keep releases working:

- Bump `workspace/package.json` version in the same commit as any workspace change. tauri-action republishes over an existing release without failing, so a forgotten bump ships silently stale bits.
- After merging, confirm with `gh release list` that the new version exists.
- Do not delete the `akbun-makepresentation-updater` release; it is the update endpoint, not a real release.
- Pull request CI runs tests only; it does not prove the release job works.

## Updater signing key (one-time setup)

The updater refuses anything not signed by the private key, and the public key is baked into `tauri.conf.json`. The key pair does not exist until someone generates it, and the placeholder `REPLACE_WITH_UPDATER_PUBKEY` must be replaced before the first release.

Generate the key pair (asks for a password; an empty one is allowed but set one):

```bash
cd workspace
npm run tauri signer generate -- -w ~/.tauri/akbun-makepresentation.key
```

Put the two repository secrets the workflow reads (run from the repository root):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_MAKEPRESENTATION < ~/.tauri/akbun-makepresentation.key
```

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_MAKEPRESENTATION_PASSWORD
```

Paste the contents of `~/.tauri/akbun-makepresentation.key.pub` into the `pubkey` field of `src-tauri/tauri.conf.json` (the key contents, not the file path).

Two warnings that are easy to learn the hard way:

- **Losing the private key means never updating installed users again.** A repository secret cannot be read back, so keep a copy of `~/.tauri/akbun-makepresentation.key` somewhere that outlives this laptop.
- If the secrets are missing from the release job, no `.sig` is produced and the action skips `latest.json` **without failing**. The release looks green and nobody can update.

## Caveats

- This is not a general OOXML editor. Files written by other tools open as the subset this app understands: unknown shape presets become rectangles, grouped shapes are skipped, theme colors fall back to gray.
- Text does not auto-wrap; line breaks are typed. The pdf uses the same SVG rendering as the screen, so what the canvas shows is what prints.
- There is no undo yet. Delete asks for nothing (shapes) or confirms (slides); Cmd+S often is the habit that matters.
- The macOS build is unsigned: first launch needs `xattr -cr /Applications/akbun-makepresentation.app`, which the release notes state.
