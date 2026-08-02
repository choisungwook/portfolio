# akbun-makevideo

Desktop video editor: a multi track timeline, a live preview, and a render to FHD or 4K. Built on Tauri with a plain HTML/JS page, so there is no build step. The editing model lives in the page; ffmpeg does the render.

## What it does

- Menu bar: new, open, save, save as, close, import media, render, settings
- Projects are folders under a workspace directory (`~/Documents/akbun-makevideo` by default, settable), with an Open list instead of a file dialog
- Assets panel: drop files from Finder or import them, with kind, length and size read by ffprobe. **Importing references the file where it is — media is never copied into the project**
- Preview: stacked playback while running, and the exact rendered frame when the playhead stops — drawn by the same shader the render uses
- Timeline: up to four video and four audio tracks, drag to move, drag an edge to trim
- Split at the playhead, from the toolbar button or Cmd+B
- Magnet: snap clips and the playhead to nearby edges, toggled from the toolbar
- Hide and mute per track
- Render to mp4 at FHD or 4K with a progress bar and a cancel button
- Renders composite on the GPU by default so the preview frame and the file agree, with the ffmpeg filter graph as a faster fallback
- GPU rendering when the machine has it: the encode moves to Apple VideoToolbox (or NVENC), detected by actually trying it, with an automatic fall back to the CPU if it fails
- Preview quality, defaulted to Half so a few tracks at once still play
- Light and dark, following the system unless told otherwise
- Self update from Settings → Check for Updates

## Requirements

Rendering and media probing need **ffmpeg** on the machine:

```bash
brew install ffmpeg
```

Everything else works without it. An app launched from Finder does not inherit a login shell, so `/opt/homebrew/bin` is not on its PATH; the app looks there directly, and Settings → Preview & Tools takes a folder if ffmpeg lives somewhere else.

Homebrew's ffmpeg is built with VideoToolbox, so GPU encoding works out of the box on a Mac. Settings → Preview & Tools says which encoder was found, or why none was.

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
| [wiki/](./wiki/) | What the next agent reads before taking over, one page per part under [wiki/architecture/](./wiki/architecture/) |
| [adr/](./adr/) | Decision records |

## Where things go

```text
~/Documents/akbun-makevideo/     the workspace, set in Settings
  summer trip/                   one folder per project
    project.akbunvideo           the edit: settings, media paths, tracks, clips
    summer-trip-fhd.mp4          renders default here
```

The project file stores **paths** to media, not media. Moving or deleting an imported file breaks its clips, which show hatched red in the timeline and are skipped by the render. See [wiki/architecture/workspace-and-files.md](./wiki/architecture/workspace-and-files.md).

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
