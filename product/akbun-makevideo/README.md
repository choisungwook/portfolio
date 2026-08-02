# akbun-makevideo

Desktop video editor: a multi track timeline, a live preview, and a render to FHD or 4K. Built on Tauri with a plain HTML/JS page, so there is no build step. The editing model lives in the page; ffmpeg does the render.

## What it does

- Menu bar: new, open, save, save as, close, import media, render, settings
- Assets panel: drop files from Finder or import them, with kind, length and size read by ffprobe
- Preview: the timeline composited live, or a single asset on its own
- Timeline: up to four video and four audio tracks, drag to move, drag an edge to trim
- Split at the playhead, from the toolbar button or Cmd+B
- Magnet: snap clips and the playhead to nearby edges, toggled from the toolbar
- Hide and mute per track
- Render to mp4 at FHD or 4K with a progress bar and a cancel button
- Preview quality, defaulted to Half so a few tracks at once still play
- Light and dark, following the system unless told otherwise
- Self update from Settings → Check for Updates

## Requirements

Rendering and media probing need **ffmpeg** on the machine:

```bash
brew install ffmpeg
```

Everything else works without it. An app launched from Finder does not inherit a login shell, so `/opt/homebrew/bin` is not on its PATH; the app looks there directly, and Settings → Preview & Tools takes a folder if ffmpeg lives somewhere else.

## Shortcuts

Cmd on macOS, Ctrl elsewhere.

| Key | What it does |
|---|---|
| Space | Play or pause the preview |
| Cmd+B | Split at the playhead |
| Cmd+N / Cmd+O / Cmd+S / Shift+Cmd+S | New, open, save, save as |
| Cmd+I | Import media |
| Delete | Delete the selected clip |
| ← → | Step one frame, or one second with Shift |
| Home | Back to the start |
| Escape | Close a menu or a sheet |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: the page in src/, the Tauri shell and the render crate in src-tauri/ |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [adr/](./adr/) | Decision records |

## Quick start

Run in development (needs Rust and Node):

```bash
cd workspace
npm install
npm start
```

Run the tests, which need neither an app binary nor ffmpeg:

```bash
npm test
npm run test:rust
```

Build the installable app:

```bash
npm run dist
```
