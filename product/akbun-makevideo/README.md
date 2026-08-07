# akbun-makevideo

Desktop video editor: a multi track timeline, a live preview, and a render to FHD or 4K. Built on Tauri with a plain HTML/JS page, so there is no build step. The editing model lives in Rust and every edit is an undoable command; ffmpeg does the render.

## What it does

- Menu bar: new, open, save, save as, close, import media, render, settings
- Projects are folders under a workspace directory (`~/Documents/akbun-makevideo` by default, settable), with an Open list instead of a file dialog
- Assets panel: drop files from Finder or import them, with kind, length and size read by ffprobe. **Importing references the file where it is — media is never copied into the project**
- Program monitor: the render's own compositor draws straight onto a surface in the window, and the audio clock decides when each frame is shown. Playing and stopped are the same picture, so what is on screen is what will be in the file
- The older preview — stacked media elements, with the composited frame swapped in when the playhead stops — is still there as a setting and as the automatic fallback when the monitor cannot start
- Timeline: up to four video and four audio tracks, drag to move, drag an edge to trim
- Frame rates including the broadcast ones — 23.976, 29.97 and 59.94 are held as the exact ratios they are, so a camera file stays in step with itself. The clock reads in timecode and the arrow keys step a frame at a time
- Split at the playhead, from the toolbar button or Cmd+B
- Undo and redo across everything: moves, trims, splits, imports, track changes and the timebase. A drop that imports three files and lays down three clips comes back on one press
- Ripple delete: take a clip out and close the gap behind it
- Magnet: snap clips and the playhead to nearby edges, toggled from the toolbar
- Hide and mute per track
- Render to mp4 at FHD or 4K with a progress bar and a cancel button
- Renders composite on the GPU by default so the preview frame and the file agree, with a software compositor when there is no GPU and the ffmpeg filter graph as a faster route
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
| Cmd+Z / Shift+Cmd+Z | Undo, redo |
| Delete | Delete the selected clip |
| Shift+Delete | Delete it and close the gap behind it |
| ← → | Step one frame, or one second with Shift |
| Home | Back to the start |
| Escape | Close a menu or a sheet |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: the page in src/, the Tauri shell and the model, render and compositor crates in src-tauri/ |
| [wiki/](./wiki/) | What the next agent reads before taking over, one page per part under [wiki/architecture/](./wiki/architecture/) |
| [adr/](./adr/) | Decision records |
| [quality/](./quality/) | Playback quality harnesses, thresholds and baseline |

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
npm run test:edit
npm run test:rust
npm run test:present
```

Build the installable app:

```bash
npm run dist
```
