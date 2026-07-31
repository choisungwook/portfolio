# ADR

Decision records for akbun-screenshot in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Electron with native screencapture](2026-07-electron-native-screencapture.md) - Chose Electron over Rust and delegated capture to the macOS screencapture binary.
* [Release from package.json version](2026-07-release-workflow.md) - The version field drives the tag and an unsigned arm64 dmg ships with an xattr note.
