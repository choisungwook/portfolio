# Tauri with a plain page, macOS build first

## Decision

Build on Tauri with plain HTML/CSS/JS and no bundler, reusing the layout and release shape of akbun-makepresentation. The release workflow builds macOS (Apple Silicon) only for now.

## Reason

The editor is a page: a menu bar, two panels, a timeline drawn from a JSON object. The heavy work is not in the window at all — it is ffmpeg, in a process of its own — so nothing here needs a node runtime behind the UI. That is the split Tauri is good at, and the installer stays around a tenth of the Electron equivalent.

None of the reasons to prefer Electron apply. There is no tray surface, and no node-only dependency: the render is a subprocess either way, and the file work is small enough to write directly in Rust. The one platform that matters today is the machine the author actually uses, which is an Apple Silicon Mac.

Tauri renders in each platform's own webview, so shipping Windows later means checking the preview on WebView2 as well — stacked `<video>` elements are exactly the kind of thing that behaves differently between engines. That is a real cost of this choice, and it is a cost worth paying while there is one platform.

The no-build-step rule keeps the source that runs identical to the source in the repository, and it is what lets the timeline model load under `node --test` with a two line export guard.
