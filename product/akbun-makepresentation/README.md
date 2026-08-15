# akbun-makepresentation

Desktop slide deck editor for the slides actually used in blog posts and talks: a 16:9 canvas, a handful of shapes, text, pptx open/save, pdf export, and a presentation mode. Built on Tauri with a plain HTML/JS page, so there is no build step.

## What it does

- Slides: add, delete, duplicate, switch, reorder by drag or by Cmd+Up/Down, thumbnail panel
- Per-slide background color from its own panel card, with presets, a custom color and apply-to-all
- Shapes: rectangle, ellipse, line, arrow, freehand pen
- Text boxes with font family, size, color, bold, italic, underline and alignment
- Text written inside a rectangle or an ellipse, centered, with the same font controls
- Per-shape line color, width, style (solid/dashed/dotted) and fill
- Multi-object group and ungroup from the right-click menu or the panel, with grouped move and duplicate
- Its own File, Edit and View menus in the window rather than in the system menu bar
- Image borders and interactive crop handles with a shaded outside area
- Optional arrowhead at the end of a freehand stroke
- Line and arrow ends chosen per side: none, triangle, open arrow, circle, diamond
- Zoom from 50% to 400%, from the status bar or the keyboard
- Slide numbers, toggled from the status bar
- Undo and redo, multi-object selection, copy and paste, duplicate
- Paste text and images from the system clipboard
- Open and save .pptx, export every slide as a .pdf
- Presentation mode (fullscreen, arrow keys)
- Self update from the Updates button

## Shortcuts

Cmd on macOS, Ctrl on Windows and Linux.

| Key | What it does |
|---|---|
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+C, Cmd+V | Copy selected objects, or paste the latest system clipboard text or image |
| Cmd+D | Duplicate the selected objects, or the whole slide when nothing is selected |
| Cmd+S | Save |
| Cmd+N, Cmd+O | New deck, open a deck |
| Cmd+Up / Cmd+Down | Move the current slide one place earlier or later |
| Cmd+B, Cmd+I, Cmd+U | Bold, italic, underline the selected text box, or the style new ones start with |
| Cmd++ / Cmd+- | Zoom in / out |
| Cmd+0 | Fit the slide to the window |
| Shift while drawing | Square or circle; lines and arrows snap to 45 degrees |
| Shift while resizing | Rectangle to square, ellipse to circle; line and arrow stay on their original axis |
| Shift while dragging | Move on one axis only |
| Shift+click | Add an object to the selection, or drop it out. Over empty space it keeps the selection |
| Drag on an empty slide | Select every object fully enclosed by the dragged area |
| Cmd+drag | Drag a copy and leave the original in place |
| Cmd+Shift+drag | Same, with the copy kept on one axis |
| V R O L A P T | Select, rectangle, ellipse, line, arrow, pen, text |
| Arrows | Nudge the selection by 1px, or 10px with Shift |
| Delete, Backspace | Delete the selection when the editor has focus; otherwise delete the current slide. Inside a text box being edited they delete a character instead |
| Double click on a shape | Edit its text |
| Typing over a selected shape | Starts writing in it. The tool letters come back once nothing is selected |

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
