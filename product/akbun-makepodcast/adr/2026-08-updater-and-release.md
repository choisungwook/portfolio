# The supported updater, on a fixed tag

## Decision

Self update uses the official `tauri-plugin-updater`. `workspace/package.json` holds the only version, `tauri.conf.json` points at it, and `tauri-apps/tauri-action` builds the dmg, signs the update artifact, writes `latest.json` and creates the release. GitHub creates the tag as a side effect, so the workflow has no `git tag` step. A second step copies `latest.json` to the fixed tag `akbun-makepodcast-updater`, which is what the app polls.

## Reason

The plugin rather than a hand written updater is settled elsewhere in this repository and there is no reason to relitigate it: it verifies a signature, it is maintained, and akbun-k8supgradeview's hand rolled path exists only because Squirrel.Mac cannot install an unsigned build through the electron-updater route.

The fixed tag is the part specific to this repository. `releases/latest` is repository wide, and several products release from here, so whichever product shipped most recently owns it. An installed copy polling `releases/latest/download/latest.json` would be told about another app's version. The endpoint therefore points at a tag only this product's workflow touches, and the release step uploads over it with `--clobber`.

Two settings in the action are load bearing and both fail quietly if wrong. `createUpdaterArtifacts` must be true or no `.sig` is produced, and the action then skips `latest.json` without failing: the release looks complete and no installed copy can ever update. `releaseDraft` must be false, because a draft release is not reachable by the endpoint at all.

The version is the trap this repository has already been caught by, and Tauri makes it quieter than Electron did. electron-builder's release step went red on a duplicate tag; `tauri-action` finds the existing release and republishes over it. The run is green, the release looks right, and it contains the previous build. On the running app's side `check()` compares the same number against itself and returns null, so the user is told they are up to date. Neither end reports anything. The only defence is to bump `package.json` in the same commit that changes anything under `workspace/`, and to check `gh release list` after merging.

The signing key is not a code signing certificate. It proves an update came from this repository; it does nothing about the first run warning on an unsigned macOS build, which is why the release notes carry the `xattr -cr` line. Losing the private key means no future release can be signed with the key installed copies trust, and generating a new one does not fix that, because their installed copy rejects the new signature.
