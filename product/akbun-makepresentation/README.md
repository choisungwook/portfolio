# akbun-makepresentation

Desktop slide deck editor for the slides actually used in blog posts and talks: a 16:9 canvas, a handful of shapes, text, pptx open/save, pdf export, and a presentation mode. Built on Tauri with a plain HTML/JS page, so there is no build step.

## What it does

- Open each file in a separate app process, with independent settings, undo history and AI conversations
- Find text and code across all slides with Cmd+F, then jump to the matching object
- Slides: add, delete, duplicate, switch, reorder by drag or by Cmd+Up/Down, thumbnail panel
- Per-slide background color from its own panel card, with presets, a custom color and apply-to-all
- Shapes: rectangle, ellipse, speech bubble, line, arrow, freehand pen
- Text boxes with font family, size, color, bold, italic, underline and alignment
- Text written inside a rectangle, ellipse or speech bubble, centered, with the same font controls
- Per-shape line color, width, style (solid/dashed/dotted) and fill
- Right-click Lock/Unlock: keep selection while preventing object edits, including moves and style changes
- Settings → General: new-object fill, text color, borders (including none), and arrowhead defaults
- Editable code blocks fit their source and keep the frame and text in proportion when resized
- Multi-object group and ungroup from the right-click menu or the panel, with grouped move and duplicate
- Its own File, Edit and View menus in the window rather than in the system menu bar
- Configurable TITLE and CONTENT guideline margins, stored per document on this device in px or cm
- Image borders and interactive crop handles with a shaded outside area
- Line, arrow and freehand ends chosen per side: none, triangle, open arrow, circle, diamond
- Rotate any object from the grip above its resize handles, in quarter turns with Shift
- Zoom from 50% to 400%, from the status bar or the keyboard
- Slide numbers, toggled from the Slides menu
- Undo and redo, multi-object selection, cut, copy and paste, duplicate
- Stacking order from the Edit menu or the right-click menu: bring to front, bring forward, send backward, send to back. A new object starts in front
- Copy objects to the system clipboard as PNG, text and editable object data; paste across independent instances or into other apps
- Paste text and images from the system clipboard
- Open and save .pptx, export every slide as a .pdf
- Presentation mode (fullscreen, arrow keys)
- Self update from Settings, Updates
- AI panel backed by a separately installed Codex CLI and its ChatGPT subscription login
- Streaming text, generated images, and non-destructive slide edits from an app-owned conversation
- Slide mode sends the model a measured reading of the slide and a rendered picture of it, so it works from what is there rather than from a guess
- Quick chips above the composer: draw an IT architecture diagram, tidy an existing one, polish or summarise the wording, and four image styles (webtoon, watercolour, flat, 3D)
- Six diagram layouts and ten colour palettes, chosen independently
- Generated images land on the current slide straight away; Cmd+Z takes one back
- Up to three local, read-only conversation archives per document; each archive including images is capped at 128 MiB

## Shortcuts

Cmd on macOS, Ctrl on Windows and Linux.

| Key | What it does |
|---|---|
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+C, Cmd+V | Copy selected objects, or paste the latest system clipboard text or image |
| Cmd+X | Cut the selected objects to the clipboard |
| Cmd+D | Duplicate the selected objects, or the whole slide when nothing is selected |
| Cmd+S | Save |
| Cmd+N, Cmd+O | New deck or open a deck in a separate process |
| Cmd+F | Search text and code across all slides; Enter / Shift+Enter moves between results |
| Cmd+Up / Cmd+Down | Move the current slide one place earlier or later |
| Cmd+B, Cmd+I, Cmd+U | Bold, italic, underline the selected unlocked text box |
| Cmd++ / Cmd+- | Zoom in / out |
| Cmd+0 | Fit the slide to the window |
| Shift while drawing | Square or circle; lines and arrows snap to 45 degrees |
| Shift while resizing | Keep the proportions the object already has; line and arrow stay on their original axis |
| Shift while dragging | Move on one axis only |
| Shift+click | Add an object to the selection, or drop it out. Over empty space it keeps the selection |
| Drag on an empty slide | Select touched outlines or filled regions; hollow interiors alone do not select the enclosing shape |
| Cmd+drag | Drag a copy and leave the original in place |
| Cmd+Shift+drag | Same, with the copy kept on one axis |
| V R O B L A P T | Select, rectangle, ellipse, speech bubble, line, arrow, pen, text |
| Arrows | Nudge the selection by 1px, or 10px with Shift |
| Delete, Backspace | Delete the selection when the editor has focus; otherwise delete the current slide. Inside a text box being edited they delete a character instead |
| Shift while rotating | Quarter turns only |
| Double click on a shape | Edit its text |
| Typing over a selected shape | Starts writing in it. The tool letters come back once nothing is selected |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: the page in src/, the Tauri shell and the deck model crate in src-tauri/ |
| [design-proposal/](./design-proposal/) | Interactive UI proposal and PNG previews, with English and Korean interface options |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [human-wiki/](./human-wiki/) | Architecture and decisions the human maintainer must understand |
| [adr/](./adr/) | Decision records |

## Quick start

Run in development (needs Rust and Node):

```bash
cd workspace
npm install
npm start
```

AI features additionally require Codex CLI on `PATH` and a ChatGPT login made with `codex login`. The app does not bundle Codex, copy its credentials, or support API key authentication. Settings, AI only reports whether that existing subscription login is available.

Run the tests, which need no app binary:

```bash
npm test
npm run test:rust
```

Build the installable app:

```bash
npm run dist
```
