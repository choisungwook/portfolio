# akbun-makepresentation

Desktop slide deck editor for the slides actually used in blog posts and talks: a 16:9 canvas, a handful of shapes, text, pptx open/save, pdf export, and a presentation mode. Built on Tauri with a plain HTML/JS page, so there is no build step.

## What it does

- Slides: add, delete, switch, thumbnail panel
- Shapes: rectangle, ellipse, line, arrow, freehand pen
- Text boxes with font size and color
- Per-shape line color, width, style (solid/dashed/dotted) and fill
- Open and save .pptx, export every slide as a .pdf
- Presentation mode (fullscreen, arrow keys)
- Self update from the Updates button

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
