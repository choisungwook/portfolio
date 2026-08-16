# Architecture

## Process structure

Two app sides, one JSON model between them, plus an optional external AI process.

- **The page** (`workspace/src/`): plain HTML/CSS/JS served straight from disk, no bundler. It owns the deck in memory, draws it as SVG, and handles every interaction: tools, selection, resize handles, text editing, the property panel, thumbnails, presentation mode.
- **Rust** (`workspace/src-tauri/`): everything that touches the file system and child processes. The pure deck and AI session stores live in `makepresentation-deck` and `makepresentation-ai`; both depend on neither Tauri nor a webview. The Tauri modules are thin shims over them.
- **Codex App Server**: an optional `codex app-server --listen stdio://` child process discovered from the user's installation. It reuses the Codex CLI ChatGPT login; no executable or credential is copied into the app.

## The deck model

One JSON object, identical on both sides (serde mirrors it in Rust):

```json
{ "slideWidth": 1920, "slideHeight": 1080, "slides": [ { "background": "#ffffff", "shapes": [ {
  "kind": "rect | ellipse | line | arrow | pen | text | image",
  "x": 0, "y": 0, "w": 0, "h": 0,
  "points": [[0, 0]],
  "stroke": "#1a1a1a", "strokeWidth": 2, "dash": "solid | dash | dot",
  "fill": "none | #rrggbb",
  "text": "", "fontSize": 24, "textColor": "#1a1a1a", "fontFamily": "Helvetica",
  "bold": false, "italic": false, "underline": false,
  "textAlign": "left | center | right", "verticalAlign": "top | center | bottom",
  "rotation": 0,
  "arrowStart": "none | triangle | arrow | oval | diamond",
  "arrowEnd": "none | triangle | arrow | oval | diamond"
} ] } ] }
```

`background` belongs to the slide rather than to a page-sized shape, so the one control that changes it cannot touch a shape and the background cannot be selected or dragged ([ADR](../adr/2026-08-background-is-a-slide-field.md)). A slide with no `background` is white, which is what a deck saved before the field existed deserializes to.

`fontFamily` is one plain family name, not a CSS stack, so it maps straight onto the pptx `a:latin` typeface and survives a round trip unchanged. A generic fallback is appended when the SVG is drawn.

`arrowStart` and `arrowEnd` use the pptx `a:headEnd`/`a:tailEnd` type names, so a round trip is a rename. Every linear shape names its ends this way, the freehand pen included; there is no separate boolean for the pen ([decision](../knowledge/decisions/2026-08-one-end-model-for-every-stroke.md)).

`rotation` is degrees about the centre of the shape's box, applied as a render transform so x/y/w/h never move. pptx stores the same angle in `a:xfrm rot` at 1/60000 degree ([decision](../knowledge/decisions/2026-08-rotation-is-a-render-transform.md)).

Coordinates are pixels in the deck's slideWidth and slideHeight coordinate space, which defaults to 1920x1080. Boxy shapes use x/y/w/h; lines run from (x,y) to (x+w,y+h) so w and h may be negative; the pen keeps absolute points and ignores the box. pptx EMU is exactly 9525 per pixel, so conversion is one multiply.

## Page files

- `editor.js` — the pure part: shape creation, drag/move/resize math, slide operations, and the SVG markup for shapes and slides. Exported behind one global (`slidesLib`) and through `module.exports`, so `node --test` runs it as-is.
- `settings.js` — settings defaults, validation, legacy preset migration normalization, and guideline geometry. It is pure and runs under the same node test suite.
- `api.js` — the only bridge to the OS: native dialogs, filesystem commands, the updater. Falls back to no-ops in a plain browser so the editor can be poked at without Tauri.
- `ai.js` — pure AI session normalization, capacity checks, and validated slide patch application.
- `ai-panel.js` — App Server JSON-RPC, streaming turns, the Inspector/AI panel switch, and the local conversation UI.
- `renderer.js` — DOM state and events: tools, pointer interaction, the overlay textarea for text editing, property panel, thumbnails, presentation mode.

## IPC surface

Filesystem access stays behind narrow commands. Deck and export paths come from native dialogs; the settings commands resolve the app data directory inside Tauri.

| Command | In | Out |
|---|---|---|
| `open_deck` | path | Deck |
| `save_deck` | path, Deck | — |
| `export_pdf` | path, pages `[{dataUrl, width, height}]` | — |
| `save_png` | path, PNG data URL | — |
| `list_system_fonts` | — | font family names |
| `load_settings` | — | settings JSON or null |
| `save_settings` | settings JSON | — |
| `ai_start_server`, `ai_send_rpc`, `ai_stop_server` | App Server lifecycle and JSON-RPC | server info or events |
| `ai_list_sessions`, `ai_load_session`, `ai_save_session`, `ai_delete_session` | app-owned session JSON | summaries, session, or size |
| `ai_attach_image`, `ai_copy_image` | validated generated/saved image paths | saved image metadata or file copy |

## Key flows

**Save**: page hands the deck JSON to `save_deck`; the deck crate writes a zip with the OOXML parts (presentation, one master, one blank layout, one theme, one part per slide) from string templates.

**Open**: the deck crate follows each slide's layout, master and theme relationships, then walks those parts with a pull parser. It keeps preset rects/ellipses/lines, custom-geometry paths (read back as pen), text boxes, pictures (read into the deck as data URLs), flattened groups, and visible master/layout artwork. Theme colors (schemeClr plus lumMod/lumOff/shade/tint) resolve through the matching theme and master clrMap. Placeholders inherit their box and text style from the layout, master and master text styles. A non-white solid slide/layout/master background becomes the slide's `background`, while a background picture stays a page-sized image shape, and foreign page sizes (4:3, portrait, custom) keep their own pixel coordinate space. Rotation on any shape, picture crop, plus text alignment and emphasis (bold, italic, underline) survive save/open round trips. A rect or an ellipse that names no `algn` or `anchor` is read as centred, because that is where this editor writes text inside a shape, and the alternative was that text typed into an opened shape landed somewhere no shape drawn here would put it. Other presets become their bounding rectangle; unsupported tables are skipped.

**PDF export**: the page rasterizes each slide (SVG string → blob URL → Image → 1920x1080 canvas → JPEG data URL) and `export_pdf` wraps the JPEGs into PDF pages by hand — JPEG is a native PDF filter, so no PDF library is involved.

**Presentation mode**: a fullscreen overlay that renders the same slide SVG; arrow keys and clicks navigate, Escape leaves.

## AI integration

The app starts the user's Codex App Server over JSONL stdio, initializes it, and accepts only an `account/read` result whose type is `chatgpt`. API key authentication is intentionally unavailable. CLI logout therefore disables new AI turns without coupling Codex's own conversation history to this app.

Every live App Server thread is ephemeral. Before starting it, the page disables configured MCP servers, plugins, apps, web search, shell tools, hooks, memories and multi-agent tools for that thread. Each turn uses `approvalPolicy: never`, the app AI runtime as its only writable root, and command network access off.

The app owns the durable conversation instead:

- Stored under the Tauri app data directory at `ai/sessions/<session-id>/`.
- Maximum three session directories and 128 MiB per session including images.
- A closed or restored session is read-only; continuing requires a new conversation.
- A stopped turn keeps the received delta text and stores the assistant message as stopped.
- Codex-generated images are copied from its generated-images directory into the session before display. Deleting the session removes its images.
- Image insertion is explicit. Slide mode validates structured operations and inserts a changed clone immediately after the source slide, preserving the original.

See [the AI integration ADR](../adr/2026-08-codex-app-server-ai.md).

## Text editing

Editing runs in a textarea laid over the slide, styled to match the glyphs it hides. Two things about it are load-bearing.

The press that opens it is detected in `pointerdown` — two presses on the same shape within 400 ms — and not from a `dblclick` event. The browser never reports one here: `pointerup` redraws the canvas from the model, so `mouseup` lands on a freshly built element rather than the one that took `mousedown`, and a click needs both. Relying on `dblclick` meant text boxes could not be reopened at all.

That press also calls `preventDefault`, which is what keeps the focus the overlay is about to take. Without it the press hands focus back to the page, and then every keystroke reaches the global shortcuts: Backspace deletes the box being typed into, letters switch tools. The document handler carries the same rule as a backstop — while `editingIndex` is set, the keyboard belongs to the overlay — and `commitTextEdit` tolerates a shape that is already gone, since reading through it took the whole page down.

## Rendering rule

Every mutation goes through the model and the page redraws from it (`renderAll`). Nothing merges partial updates into the DOM, so the canvas, thumbnails and property panel can never drift apart.

## Undo history

`markDirty` is the one hook every mutation already passes through, so history hangs off it rather than off each call site. It pushes the deck as it stood at the previous commit onto a past stack and takes a fresh snapshot; undo and redo move whole-deck clones between the two stacks. Snapshots are `structuredClone` of the whole deck, which is cheap at this scale — a deck is a few hundred small objects.

Opening a file or starting a new deck clears both stacks, because a history that reaches back across a different document has nothing sensible to restore.

## Zoom

Zoom is a view setting: it lives in `state`, not in the deck, and nothing about the model changes with it. The stage is a scroller wrapping the slide, and zoom is one CSS variable multiplying the fitted width, so the browser does the scaling and scrollbars appear on their own once the slide outgrows the window.

Its control lives in the status bar along the bottom. Slide numbers are toggled from the Slides menu, away from the drawing tools.

Nothing else has to know. Pointer positions come from `getBoundingClientRect`, which already reports the zoomed box, so clicks map onto slide coordinates at any zoom. The one exception is the overlay textarea, placed in screen pixels: zooming while a text box is open would strand it, so a zoom commits the edit first.

## Slide numbers

The number is an ordinary text shape from `slideNumberShape`, not a special case in the renderer. That way it draws, rasterizes for the pdf, and exports to pptx through the paths that already exist.

It lives outside `slide().shapes` while editing, so it cannot be selected or dragged. A .pptx has nowhere to record "show slide numbers", so saving bakes a real text box into each slide and opening a file starts with the toggle off.

## App settings

The Tauri shell reads and writes `settings.json` in the app data directory. The page validates the JSON and keeps guideline visibility, guideline margins and custom presets there. Guideline margins are stored as pixels while the last px/cm display unit is stored alongside them.

Older versions stored custom presets in localStorage. When no settings file exists, the page imports that list, writes `settings.json`, and removes the old key only after the new file is saved.
