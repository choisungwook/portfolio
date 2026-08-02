# akbun-makepresentation

Desktop slide deck editor for the slides actually used in blog posts and talks: a 16:9 canvas, a handful of shapes, text, pptx open/save, pdf export, and a presentation mode. Built on Tauri with a plain HTML/JS page, so there is no build step.

## What it does

- Slides: add, delete, duplicate, switch, thumbnail panel
- Per-slide background color from its own panel card, with presets, a custom color and apply-to-all
- Shapes: rectangle, ellipse, line, arrow, freehand pen
- Text boxes with font family, size, color, bold, italic, underline and alignment
- Per-shape line color, width, style (solid/dashed/dotted) and fill
- Zoom from 50% to 400%, from the control in the corner of the stage or the keyboard
- Slide numbers, toggled from the № button
- Undo and redo, copy and paste, duplicate
- Open and save .pptx, export every slide as a .pdf
- Presentation mode (fullscreen, arrow keys)
- Self update from the Updates button

## Shortcuts

Cmd on macOS, Ctrl on Windows and Linux.

| Key | What it does |
|---|---|
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+C, Cmd+V | Copy the selected shape, paste it down and to the right |
| Cmd+D | Duplicate the selected shape, or the whole slide when nothing is selected |
| Cmd+S | Save |
| Cmd+B, Cmd+I, Cmd+U | Bold, italic, underline the selected text box, or the style new ones start with |
| Cmd++ / Cmd+- | Zoom in / out |
| Cmd+0 | Fit the slide to the window |
| Shift while drawing | Square or circle; lines and arrows snap to 45 degrees |
| Shift while dragging | Move on one axis only |
| Cmd+drag | Drag a copy and leave the original in place |
| Cmd+Shift+drag | Same, with the copy kept on one axis |
| V R O L A P T | Select, rectangle, ellipse, line, arrow, pen, text |
| Arrows | Nudge the selection by 1px, or 10px with Shift |
| Delete | Delete the selection |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: the page in src/, the Tauri shell and the deck model crate in src-tauri/ |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [adr/](./adr/) | Decision records |

## Quick start

Run in development (needs Rust and Node):

```bash
cd workspace
npm install
npm start
```

Run the tests, which need no app binary:

```bash
npm test
npm run test:rust
```

Build the installable app:

```bash
npm run dist
```
