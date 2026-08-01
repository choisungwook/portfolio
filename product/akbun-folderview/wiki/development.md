# Development

Everything happens in `workspace/`. The page has no build step: `src/index.html`, `src/style.css` and the three script tags in it are the source that runs. The Rust side is a normal cargo crate under `src-tauri/`, so that half does get compiled.

## Prerequisites

- Node. The workflow uses 24; anything current works, because the only dependency is the Tauri CLI and the tests are plain `node --test`.
- A Rust toolchain, stable channel. Install it with `rustup`; nothing here needs nightly.
- On Windows, the system webview runtime. It ships with Windows 11 and with current Windows 10, so in practice it is already there and only an old machine needs it installed by hand. The app is a window around that runtime, not a bundled browser, which is why the installer is a few megabytes rather than a hundred.

The first `npm start` compiles the whole Rust dependency tree and takes minutes. After that it is incremental, and a change to a file under `src/` needs no compile at all.

## Run

Install the CLI and start the app:

```bash
cd workspace
npm install
npm start
```

That runs `tauri dev`. It opens the window, watches `src/`, and rebuilds the Rust side when something under `src-tauri/` changes.

It also runs on macOS, which is how the layout of this window was checked. It is a development convenience and not a target: no job builds a macOS artifact, and the webview underneath is a different engine from the Windows one. See the caveats.

## Test

There are two suites and they never cross the bridge between the page and Rust.

The page suite covers `src/library.js`: query token parsing, the folder tree, tag and rating counts, and size formatting.

```bash
npm test
```

The Rust suite covers `src-tauri/src/library.rs`: which extensions count as a photo or a video, the rescan merge that carries a user's rating and tags across a scan, the prefix check that keeps `C:\photos-backup` out of `C:\photos`, and the per-field settings fallback when `settings.json` is partial.

```bash
npm run test:rust
```

The split follows the runtime split rather than being a convention. The page holds the whole library and searches it in memory, so searching, the tree and the counts are page code and are tested by node. Scanning the disk and persisting the library are Rust, so the part of that side which needs neither a disk nor an app handle is tested by cargo. `scan_folder` and `store.rs` are not covered, because both need one. Neither suite needs a webview, an app binary, or an installed app, so the pull request job runs both on a Linux runner.

`library.rs` uses no Tauri type, but it lives in the same crate as the app, so cargo builds the whole dependency tree to run four unit tests. That is why the pull request job installs the Linux webview and GTK development packages, and why it caches the cargo build. The consolation is that the job also compiles the Rust on every pull request, so a compile error surfaces there instead of on the release runner. Splitting the model into its own crate would make the tests cheap and the system packages unnecessary; it has not been worth the extra crate yet.

`npm test` also needs no `npm install`. The only dependency in `package.json` is the CLI, and the page suite does not use it.

## Version

`workspace/package.json` `version` is the only version in the project. `tauri.conf.json` points at it:

```json
"version": "../package.json"
```

`src-tauri/Cargo.toml` also has a `version`. The bundler does not read it; it is there because cargo requires it. Do not bump it and do not trust it.

Bump `package.json` in the same commit that changes anything under `workspace/`: patch for a fix, minor for a feature.

Forgetting the bump does not fail anything, in either direction, and that is the trap.

On the build side, the release action finds the release that already exists for `akbun-folderview-v<version>` and republishes over it. The run is green. The version number never moves.

On the running app's side, the updater compares the version in `latest.json` against the version it is running. They are the same number, so `check()` returns `null`, and `api.js` shows "You are on the latest version." The user is told they are up to date while the new code sits in the release.

So neither end reports a problem. After merging anything that touched `workspace/`, check the run and compare the release list to `package.json`:

```bash
gh run list --workflow=release-akbun-folderview.yml
gh release list
```

## Release

`.github/workflows/release-akbun-folderview.yml` has two jobs. Both triggers filter on `product/akbun-folderview/**`, so a change to the workflow file alone does not start a build.

`verify` runs on pull requests, on `ubuntu-latest`. It checks out, sets up Node, runs the page suite, installs the Linux build packages, restores the cargo cache, and runs the Rust suite. It does not look at the version, does not build the installer, and does not install npm dependencies.

`release` runs on a master push and on `workflow_dispatch`, on `windows-latest`, with `contents: write`. It checks out, sets up Node and a stable Rust toolchain, restores the cargo cache keyed to `src-tauri` (without it every release rebuilds the entire dependency tree), runs `npm install`, and hands the rest to the Tauri release action. That action builds the installer, signs the update artifact, writes `latest.json`, creates the GitHub release, and uploads everything to it.

The release job does not run the tests. `verify` is the only place they run, so a direct push to master ships without them.

Three details in that step are load-bearing.

- The tag is created by GitHub as a side effect of creating the release. The workflow never runs `git tag`. That is why a duplicate version republishes instead of failing.
- `releaseDraft: false`. A draft release is not reachable at `releases/latest/download/latest.json`, so every installed copy would get a 404 on its update check.
- `updaterJsonPreferNsis: true`. Only an NSIS-style installer is built, and the default preference in `latest.json` is the other format.

To build the installer locally on a Windows machine:

```bash
npm run dist
```

The installer lands under `src-tauri/target/release/bundle/`. It is not cross compiled from macOS: building a Windows installer from a machine that is not Windows produces an artifact nobody can run before shipping it, and the runner is the cheaper answer.

## Updater keys, one time

The updater verifies a signature before it installs anything. The public half lives in `tauri.conf.json` and ships inside the app; the private half signs the artifact in CI. Right now `tauri.conf.json` still holds the placeholder `REPLACE_WITH_MINISIGN_PUBLIC_KEY`, so no release yet produces a working update. Do this once.

1. Generate the key pair, from `workspace/`. It asks for a password and prints the public key.

   ```bash
   npm run tauri -- signer generate -w ~/.tauri/akbun-folderview.key
   ```

2. Paste the printed public key into `tauri.conf.json` under `plugins.updater.pubkey`, replacing the placeholder, and commit it. A public key belongs in the repository.

3. Add two repository secrets. The first is the whole contents of the private key file, the second is the password from step 1.

   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/akbun-folderview.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```

4. Back the private key file up somewhere that is not GitHub. A secret cannot be read back out once it is set, so GitHub is storage, not a backup. Losing the private key means no future release can be signed with the key installed users trust. Generating a new one does not fix that: their installed copy rejects the new signature, and the only way forward is asking every user to download and install by hand.

5. Cut one release and confirm that `latest.json` and a `.sig` file are attached to it.

Without those two secrets the build still succeeds and the release still appears. No signature is produced, `latest.json` is quietly skipped, and the only symptom is that updates never arrive.

## Caveats

- The build is unsigned. Windows warns before running an executable it does not recognise, and a user who does not know to choose "More info" and then "Run anyway" will conclude the download is broken. The release notes say so for that reason. A certificate costs money every year, so this stays until somebody buys one.
- The updater public key in `tauri.conf.json` is still the placeholder. Until it is replaced and the matching secrets are set, Check for Updates has nothing to verify against and no installed copy can update itself. Everything else about the release works, which is what makes this easy to miss.
- The installer is per user (`installMode: currentUser`). It installs into the user folder, never asks for administrator rights, and that is also what lets an update install without an elevation prompt. The other side of it: each account on a machine has its own copy and its own library file.
- Delete moves the file to the Recycle Bin rather than unlinking it, so a mis-click is recoverable outside this app. That call fails on some network drives and on some removable media. The error is shown and nothing is deleted; there is deliberately no fallback to a permanent delete.
- Copy puts the file path on the clipboard, not the file. Placing a file on the clipboard so a file browser can paste it needs a clipboard format that is out of reach here, and was out of reach in the previous implementation too. Show in Folder covers the case where the file itself was what was wanted.
- A scan reads metadata for every file it walks, and there is no progress indicator. Adding a very large folder blocks with no feedback for a few seconds.
- There is no file system watcher. Files added to a folder on disk after it was indexed appear only after Rescan.
- Debug builds open the webview devtools on start. That is deliberate, because the window is the whole app and most bugs show up in that console first. Release builds do not.
- A macOS development run uses the system webview on that platform, which is a different engine from the one on Windows. Codec support and layout details can differ, so a video that plays in a dev run is not proof it plays in the shipped build, and the reverse holds too. Anything visual is worth checking on Windows before believing it.
- The icon set under `src-tauri/icons/` is generated, not hand-edited. Changing the icon means replacing the one source PNG and regenerating, or the sizes drift apart:

  ```bash
  npm run tauri -- icon path/to/icon.png
  ```
