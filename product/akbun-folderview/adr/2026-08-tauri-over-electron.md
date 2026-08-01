# Tauri over Electron, with the page carried across unchanged

## Decision

Port the app to Tauri v2. Keep `index.html`, `style.css`, `renderer.js` and `library.js` as they were, rewrite the backend in Rust, and replace the preload script with `api.js`, which reaches the Tauri APIs through `withGlobalTauri` so the frontend still has no build step. Ship a Windows installer only, built on a Windows runner.

## Reason

Size, and nothing else. The Electron installer was roughly 85 to 95 MB, because it carries a browser engine and a JavaScript runtime of its own. This one is under 10 MB, because the browser engine is the one already on the machine and there is no second runtime. For an app whose job is to show a grid of thumbnails, a tenth of the download is worth a port.

It is worth being plain that size was the only real defect in the Electron version. The window was right, search was instant, the library survived restarts, and nothing about the design was fighting the framework. If the installer never had to be downloaded over a slow line, staying would have been defensible.

What made the port cheap is the second half of the decision. The page did not change: the markup, the stylesheet, the renderer and the search module are the same files, and the tests over the search module still pass unedited. Only two things were rewritten, the bridge and the backend. That is also the reason for this framework rather than another one. A framework with its own component model, or a native Windows toolkit, would have meant rewriting the part of the app that was already finished, and the saving would have had to pay for that too.

The first cost is a second language in the backend. Scanning, persistence, rename, trash, open, reveal and clipboard are Rust now, five files and under 700 lines including their tests. It is small, but a change there is a compile and a language nothing else in this repository uses. The model logic that is worth testing, `file_kind`, `merge_scan`, `is_under` and the settings fallback, has unit tests next to it for that reason.

The second cost is that `npm start` no longer runs the engine that ships. Electron bundled its engine, so the development window and the installed window were the same browser. Now a development run on macOS renders in that system's webview while the installed app renders in Windows'. The UI for this port was checked on macOS, which means a rendering difference between the two would not have been caught here. Nothing has shown up so far and the stylesheet is plain flexbox and grid, but a screenshot taken on a development machine is no longer proof.

Windows is the only supported target. macOS runs the app well enough to work on the window, and no job builds a macOS artifact.
