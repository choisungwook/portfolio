# Tauri with a plain page, macOS build first

## Decision

Build on Tauri with plain HTML/CSS/JS and no bundler, reusing the layout and release shape of akbun-folderview. The release workflow builds macOS (Apple Silicon) only for now.

## Reason

The editor is a page: an SVG canvas, a toolbar, two side panels. Nothing in it needs a node runtime behind the window, and the deck lives as one JSON object that Rust can own the file work for. That is the exact split Tauri is good at, and the installer stays around a tenth of the Electron equivalent.

The reasons that would justify Electron do not apply. There is no tray surface, no node-only dependency — the pptx and pdf work is small enough to write directly in Rust — and the one platform that matters today is the machine the author actually uses, which is an Apple Silicon Mac. Building only macOS keeps the release job to one runner; a Windows NSIS target is a matrix entry away when someone wants it.

The no-build-step rule keeps the source that runs identical to the source in the repository, and it is what lets the pure editor logic load under `node --test` with a two-line export guard.
