# Render by shelling out to an installed ffmpeg

## Decision

The render builds an ffmpeg argument list and runs `ffmpeg` as a subprocess. ffmpeg is not bundled with the app; the user installs it with `brew install ffmpeg`, and the app looks for it in the usual folders. Everything except rendering works without it.

## Reason

Encoding video is not something to write. The alternatives were binding a codec library into the Rust crate, which is a large dependency and a licensing question, or bundling ffmpeg as a sidecar, which adds roughly 70 MB to a 10 MB installer and makes the app responsible for shipping security updates to a codec bundle. Calling the one the user already has costs a paragraph in the README.

The cost is a runtime dependency that can be missing, so the app is built to say so rather than to fail late. `bootstrap` reports where ffmpeg and ffprobe were found, the menu bar shows a red chip when they are not, and Render explains the install command instead of producing an error from a process that never started.

Making the whole app depend on it would have been simpler and was rejected: an import that needs ffprobe to succeed would mean an app that cannot even show a file. Instead ffprobe is used when present, and when it is not, the page reads the duration from the media element it was going to load anyway. Only the render actually requires the binary.

Because ffmpeg is a subprocess, the argument list is the entire interface, and it is a string. It compiles whatever it says. That is why building it lives in a crate with no tauri dependency and a test per feature of the graph, and why the graph is checked against a real ffmpeg once whenever a feature is added to it.
