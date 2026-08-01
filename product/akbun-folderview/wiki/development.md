# Development

Everything happens in `workspace/`. There is no build step: the source that runs is the source in the repository.

## Run

Install dependencies and start the app:

```bash
cd workspace
npm install
npm start
```

The app runs on macOS and Linux too, because only the updater is Windows specific. That is useful for working on the window without a Windows machine, but it is not a supported target: nothing in the release workflow builds one.

## Test

Tests are plain `node --test` with no framework and no Electron binary:

```bash
npm test
```

`test/library.test.js` covers the model: search tokens, the tree, the rescan merge, tag and rating counts, and the settings merge. `test/update.test.js` covers the update path, and most of it exists to protect the disk. The installer is large, so every failed attempt that leaks a temp directory costs real space. There are three cleanup points and the test fails if any of them disappears from the source:

1. `downloadInstaller` removes its directory when the download fails.
2. The replacement script removes its work directory on its single exit path.
3. `cleanupTempDirs` runs at app start and clears whatever a kill left behind.

One test runs the replacement script for real, and it can only run on Windows because the script is a batch file. It is skipped on the pull request job and runs in the release job, which is on a Windows runner for exactly that reason.

## Version

`workspace/package.json` `version` is the only version in the project. It drives the git tag, the release name, and the update check. Bump it in the same commit that changes anything under `workspace/`: patch for a fix, minor for a feature.

Forgetting the bump does not fail the pull request. It fails later, on the master push, at the tag step, where nobody is looking. The code lands and the release does not.

## Release

`.github/workflows/release-akbun-folderview.yml` has two jobs.

`verify` runs on pull requests on ubuntu with `ELECTRON_SKIP_BINARY_DOWNLOAD`, and runs the tests only.

`release` runs on a master push, on `windows-latest`. It reads the version, installs, runs the tests, builds the installer, creates the tag `akbun-folderview-v<version>`, then creates the release with the `.exe` attached. Build before tag and tag before release, so a failed build leaves no dangling tag.

After merging anything that touched `workspace/`, check that the master push actually released:

```bash
gh run list --workflow=release-akbun-folderview.yml
```

A green pull request is not a successful release.

## Building for Windows

The installer is built on a Windows runner rather than cross compiled. Building an NSIS installer from macOS needs Wine, and the result is harder to trust than a build on the real platform. The runner is the cross compilation story: the source never has to leave a development machine that is not Windows.

To build locally on Windows:

```bash
npm run dist
```

The `.exe` lands in `workspace/release/`.

## Caveats

- The build is unsigned. SmartScreen warns on first run and the user has to choose "More info" and then "Run anyway". Code signing needs a certificate that costs money every year, so this stays until somebody buys one.
- The installer is per user and installs into the user folder, so it never asks for administrator rights. That is also what lets the update run silently.
- Deleting a file moves it to the Recycle Bin. `shell.trashItem` fails on network drives and on some removable media, and the handler surfaces that error rather than falling back to a permanent delete.
- Copy puts the file path on the clipboard, not the file itself. Placing a file on the Windows clipboard so it can be pasted into a file browser needs a clipboard format Electron does not expose.
- `stat` runs on every file during a scan, in chunks of a hundred. A very large folder takes a few seconds to add, and there is no progress indicator yet.
- Adding a folder scans it once. New files appear after Rescan (F5); there is no file system watcher.
