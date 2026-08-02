# Architecture

## Process structure

Two sides, one JSON model between them.

- **The page** (`workspace/src/`): plain HTML/CSS/JS served straight from disk, no bundler. It owns the deck in memory, draws it as SVG, and handles every interaction: tools, selection, resize handles, text editing, the property panel, thumbnails, presentation mode.
- **Rust** (`workspace/src-tauri/`): everything that touches the file system, behind three commands. The pure model and file formats live in the `makepresentation-deck` crate (`src-tauri/crates/deck`), which depends on neither Tauri nor a webview; `src/commands.rs` is a thin shim over it.

## The deck model

One JSON object, identical on both sides (serde mirrors it in Rust):

```json
{ "slides": [ { "shapes": [ {
  "kind": "rect | ellipse | line | arrow | pen | text",
  "x": 0, "y": 0, "w": 0, "h": 0,
  "points": [[0, 0]],
  "stroke": "#1a1a1a", "strokeWidth": 2, "dash": "solid | dash | dot",
  "fill": "none | #rrggbb",
  "text": "", "fontSize": 24, "textColor": "#1a1a1a", "fontFamily": "Helvetica"
} ] } ] }
```

`fontFamily` is one plain family name, not a CSS stack, so it maps straight onto the pptx `a:latin` typeface and survives a round trip unchanged. A generic fallback is appended when the SVG is drawn.

Coordinates are pixels on a fixed 1280x720 slide. Boxy shapes use x/y/w/h; lines run from (x,y) to (x+w,y+h) so w and h may be negative; the pen keeps absolute points and ignores the box. pptx EMU is exactly 9525 per pixel at this slide size, so conversion is one multiply.

## Page files

- `editor.js` — the pure part: shape creation, drag/move/resize math, slide operations, and the SVG markup for shapes and slides. Exported behind one global (`slidesLib`) and through `module.exports`, so `node --test` runs it as-is.
- `api.js` — the only bridge to the OS: native dialogs, the three commands, the updater. Falls back to no-ops in a plain browser so the editor can be poked at without Tauri.
- `renderer.js` — DOM state and events: tools, pointer interaction, the overlay textarea for text editing, property panel, thumbnails, presentation mode.

## IPC surface

Three commands, each takes a path the page picked with a native dialog:

| Command | In | Out |
|---|---|---|
| `open_deck` | path | Deck |
| `save_deck` | path, Deck | — |
| `export_pdf` | path, pages `[{dataUrl, width, height}]` | — |

## Key flows

**Save**: page hands the deck JSON to `save_deck`; the deck crate writes a zip with the OOXML parts (presentation, one master, one blank layout, one theme, one part per slide) from string templates.

**Open**: the deck crate follows each slide's layout, master and theme relationships, then walks those parts with a pull parser. It keeps preset rects/ellipses/lines, custom-geometry paths (read back as pen), text boxes, pictures (read into the deck as data URLs), flattened groups, and visible master/layout artwork. Theme colors (schemeClr plus lumMod/lumOff/shade/tint) resolve through the matching theme and master clrMap. Placeholders inherit their box and text style from the layout, master and master text styles. A non-white slide/layout/master background becomes a page-sized rect, and foreign page sizes (4:3, portrait, custom) are scaled to fit the 1280x720 canvas. Picture crop and rotation plus basic text alignment and emphasis survive save/open round trips. Other presets become their bounding rectangle; unsupported tables are skipped.

**PDF export**: the page rasterizes each slide (SVG string → blob URL → Image → 1920x1080 canvas → JPEG data URL) and `export_pdf` wraps the JPEGs into PDF pages by hand — JPEG is a native PDF filter, so no PDF library is involved.

**Presentation mode**: a fullscreen overlay that renders the same slide SVG; arrow keys and clicks navigate, Escape leaves.

## Rendering rule

Every mutation goes through the model and the page redraws from it (`renderAll`). Nothing merges partial updates into the DOM, so the canvas, thumbnails and property panel can never drift apart.

## Undo history

`markDirty` is the one hook every mutation already passes through, so history hangs off it rather than off each call site. It pushes the deck as it stood at the previous commit onto a past stack and takes a fresh snapshot; undo and redo move whole-deck clones between the two stacks. Snapshots are `structuredClone` of the whole deck, which is cheap at this scale — a deck is a few hundred small objects.

Opening a file or starting a new deck clears both stacks, because a history that reaches back across a different document has nothing sensible to restore.

## Slide numbers

The number is an ordinary text shape from `slideNumberShape`, not a special case in the renderer. That way it draws, rasterizes for the pdf, and exports to pptx through the paths that already exist.

It lives outside `slide().shapes` while editing, so it cannot be selected or dragged. A .pptx has nowhere to record "show slide numbers", so saving bakes a real text box into each slide and opening a file starts with the toggle off.
