# The supported updater plugin, and a signing key that can never be lost

## Decision

Update through the framework's updater plugin instead of a hand-written download-and-run. Check from a button in the Settings dialog, ask before installing, and let the plugin verify the signature and hand the installer over. The release job produces the signed artifacts and `latest.json`; the public key sits in `tauri.conf.json` and the private key in the `TAURI_SIGNING_PRIVATE_KEY` repository secret. The Windows install mode is `passive`, which the per-user installer allows without a prompt.

## Reason

The old updater had to be rewritten either way. It was plain Node: download the installer, spawn a detached batch script, wait on the process id, run the installer, sweep three temp directories, with tests that existed to keep those cleanup points from disappearing. None of it survives the port, because there is no JavaScript runtime behind the window any more. So the comparison was never "keep the thing that works or adopt a plugin". It was "write it a second time in Rust or use the one that ships with the framework", and the plugin wins that outright. Had the old updater been able to carry across, the choice would have been closer.

Signature verification is real defence here, not ceremony. The app downloads an executable and runs it, and where it downloads from is a URL in a config file. Without a signature, whoever can answer that URL decides what code runs on the user's machine. The plugin checks the artifact against the public key before anything is executed, and a substituted `latest.json` cannot produce a matching signature without the private key.

The cost is a key that can never be lost. The private key is the only thing that can make an update the installed copies will accept. Replacing it means the public key in a new build no longer matches what those copies were installed with, so every existing user is stranded on their current version until they download an installer by hand. A repository secret is storage, not a backup. Keep a copy somewhere that outlives the repository.

Two states worth knowing. At the time of writing the `pubkey` in `tauri.conf.json` is still `REPLACE_WITH_MINISIGN_PUBLIC_KEY`, so a release built today ships no working updater. And if the signing secrets are missing from the job, no signature file is produced and the release action skips `latest.json` without failing, which is a green release nobody can update from. See [Release from the package.json version](./2026-08-release-workflow.md).

The record this replaces was wrong, and the way it was wrong is worth keeping. It claimed that an unsigned Windows build cannot use a supported updater, and that the app therefore had to download and run the installer itself. Code signing and update signing are two different things: the packaging tool in use at the time documents a `verifyUpdateCodeSignature` option for exactly this case, and turning it off would have let the unsigned build use the supported updater. The batch script, the detached process, the three cleanup points and the tests guarding them were all paid for by a belief that was never checked.

The mistake was carrying macOS reasoning over to Windows. On macOS the system updater does verify the bundle signature and does refuse an unsigned app, which is why an unsigned macOS app has to replace itself by hand. That was taken as a property of updaters rather than a property of one platform. The shape of the error is reusable, which is why it is written down: a constraint learned on one platform was treated as a fact about the problem.
