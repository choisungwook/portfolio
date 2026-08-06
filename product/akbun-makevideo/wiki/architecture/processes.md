# Processes

One Tauri window. There is no node runtime and no bundler; `src/` is served as it is, so the source that runs is the source in the repository.

| Side | Owns |
|---|---|
| The page (`src/`) | The timeline UI, the preview clock, every keystroke. It draws the project and sends commands; it does not change it |
| Rust (`src-tauri/src/`) | The open document, the file system, ffprobe, ffmpeg, application settings, the asset protocol scope |
| The edit crate (`src-tauri/crates/edit/`) | The project, every command that changes it, the invariants, undo and redo |
| The render crate (`src-tauri/crates/render/`) | The ffmpeg argument list, ffprobe output parsing, tool discovery |
| The audio crate (`src-tauri/crates/audio/`) | The playback mix, the output, and the clock the picture follows |
| The time crate (`src-tauri/crates/time/`) | Rates and times: what a frame index means and every conversion out of one. `src/time.js` is the same model for the page |

None of these crates depends on tauri or on anything that needs a webview, which is what lets the pull request job test them on Linux in seconds. Testing the app crate instead would mean installing GTK and WebKit on the runner. The two that talk to hardware keep that behind a feature for the same reason: `--no-default-features` builds a compositor that has never heard of wgpu and an audio engine that has never heard of cpal, and each still runs everything that does not need the hardware. The verify job runs both crates twice, once each way, because the tests behind the feature are the ones the first run cannot reach.

The stack goes one way: time, then edit, then render and the compositor, then the app. The edit crate is the one every other part reads, so it is also the one that must not be able to pull any of them back in.
