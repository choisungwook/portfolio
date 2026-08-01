# ADR

Decision records for akbun-screenshot in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Electron with native screencapture](2026-07-electron-native-screencapture.md) - Chose Electron over Rust and delegated capture to the macOS screencapture binary.
* [Release from package.json version](2026-07-release-workflow.md) - The version field drives the tag and an unsigned arm64 dmg ships with an xattr note.
* [Update by dmg download and bundle swap](2026-07-update-download-and-swap.md) - The tray menu checks GitHub Releases and swaps the .app bundle, with three temp file cleanup points.
* [Three explicit preview buttons](2026-07-save-copy-close-buttons.md) - Save writes a file, Copy owns the clipboard, Close keeps nothing, and capture no longer copies on its own.
* [Annotation editor as one redrawn canvas](2026-07-annotation-editor.md) - The editor keeps a shape list instead of pixels, which is what makes undo and badge renumbering free.
* [Windows portability](2026-07-windows-portability.md) - Stayed on Electron and kept the app macOS only, since Windows would cost a new capture path, a new updater and an icon.
