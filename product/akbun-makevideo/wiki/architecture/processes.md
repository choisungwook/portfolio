# Processes

One Tauri window. There is no node runtime and no bundler; `src/` is served as it is, so the source that runs is the source in the repository.

| Side | Owns |
|---|---|
| The page (`src/`) | The project model, the timeline UI, the preview clock, every keystroke |
| Rust (`src-tauri/src/`) | The file system, ffprobe, ffmpeg, application settings, the asset protocol scope |
| The render crate (`src-tauri/crates/render/`) | The project as serde types, the ffmpeg argument list, ffprobe output parsing, tool discovery |

The render crate depends on neither tauri nor anything that needs a webview, which is what lets the pull request job test it on Linux in seconds. Testing the app crate instead would mean installing GTK and WebKit on the runner.
