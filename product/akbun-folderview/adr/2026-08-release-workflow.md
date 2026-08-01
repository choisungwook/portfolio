# Release from the package.json version, with the tag created by the release

## Decision

`workspace/package.json` `version` is the only version in the project. `tauri.conf.json` points at it with `"version": "../package.json"`, and the number in `Cargo.toml` is not read by the bundler. A master push builds the installer on `windows-latest`, signs the update artifacts, and the release action creates the release named `akbun-folderview-v<version>`; GitHub creates the tag as a side effect of that. There is no `git tag` step. Pull requests run both test suites on ubuntu and build nothing.

## Reason

One version in one file is what makes the release name, the tag and the update check agree without anything keeping them in step. The same number is read at runtime and shown in the Settings dialog, so the version the user reports is the one that produced their installer, and it is the one the update check compares against.

Step order used to be the interesting part of this workflow and no longer is. The old failure to avoid was a tag pointing at a commit whose build failed: it had to be deleted by hand, and it blocked the next attempt, because the tag name is derived from a version that has not changed. Now the release is created by the same action that just built the installer, and the tag exists only because the release does. A failed build leaves nothing behind, and a release never exists without its artifact, without either being arranged by hand.

The pull request job runs the page tests with `node --test` and the model tests with `cargo test --lib`. Both suites are pure logic and neither needs a webview, which is why a pull request gets its answer on ubuntu rather than waiting on a Windows runner. The Windows runner exists to build the installer on the platform it targets instead of cross compiling it.

The trap in this arrangement changed shape and got worse. Forgetting the version bump used to fail at the tag step: red, on master, where nobody is watching, but at least red. Now it is silent in both directions. The release action finds the existing release for that version and republishes over it, so the run is green; and at runtime the update check compares the same number against itself, finds nothing newer, and tells the user they are up to date. Nothing anywhere says the release did not reach anybody. This failure has happened before, and what it looks like from outside is a user reporting a bug that was fixed weeks ago.

The rule that follows is to bump the version in the same commit that changes anything under `workspace/`, patch for a fix and minor for a feature, and after merging to check the version on the newest release rather than the colour of the run. The signing secrets fail the same quiet way: without them no signature file is produced and `latest.json` is skipped without failing. See [The supported updater plugin](./2026-08-updater-plugin-and-signing-key.md).

The release notes carry the SmartScreen instruction because the build is unsigned. Windows warns the first time an unsigned executable runs, and a user who does not know to choose "More info" and then "Run anyway" will conclude the download is broken. Code signing needs a certificate that costs money every year, so the note stays until somebody buys one.
