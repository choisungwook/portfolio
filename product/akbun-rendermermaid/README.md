# akbun-rendermermaid

A web page that renders mermaid. Code on the left, the diagram on the right, and nothing in between: no account, no upload, no server. The page is a static Astro build with mermaid bundled into it, so every render happens in the browser that opened it.

Deployed at [mermaid.akbun.com](https://mermaid.akbun.com).

## What it does

| Feature | How it works |
|---|---|
| Render | The diagram redraws 400 ms after you stop typing. Ctrl or Cmd + Enter and the Render button skip the wait |
| Refresh | Throws the drawn diagram away and renders it again from the code, back at the fitted zoom. The button next to Render |
| Zoom | The preview zooms with its own buttons, with Ctrl or Cmd and +, - or 0, and with Ctrl or Cmd and the wheel. Fit re-fits it to the pane |
| Errors | A failed parse leaves the last good diagram on screen and prints the mermaid message, with its line and caret, under the editor. Nothing flashes away while you are mid-edit |
| Save PNG | Rasterizes the rendered SVG at 2x onto a white background and downloads it as `mermaid-<type>-<date>-<time>.png`. The export is the diagram's own size whatever the preview zoom is, and a diagram too wide for a canvas is exported at a lower scale instead of failing |
| Large view | Opens the diagram full screen, scaled to fill the window rather than left at its original size. Zoom with the buttons, +/-/0, or Ctrl and the wheel; drag to pan; Escape closes |
| Dots | A 22 px dot grid behind the preview, for lining diagrams up by eye. It is a background of the pane, so it never appears in an exported PNG. The setting is remembered |
| Restore | The code is kept in `localStorage`, so a reload or a closed tab does not lose the diagram |

The toolbar sits above the preview at the inner edge, next to the code, rather than in the far corner of the window. The preview opens at the zoom that fits the diagram in the pane, never larger than its natural size, and stays where you put it once you zoom by hand. Under 900 px the two panes stack.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/pages/` | The single Astro page: the markup and the two panes |
| `workspace/src/scripts/` | The DOM side. Render loop, PNG export, large view, storage |
| `workspace/src/lib/` | Sizing, zoom and naming, none of which touch the DOM |
| `workspace/src/styles/` | The stylesheet |
| `workspace/test/` | Tests over `src/lib`, run on plain node with no browser |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Quick start

Install dependencies and start the dev server:

```bash
cd workspace
npm install
npm run dev
```

Run the tests, which need neither a browser nor a build:

```bash
npm test
```

Build the static site and preview the build:

```bash
npm run build
npm run preview
```

Deployment is a Cloudflare Pages build on push to master. The steps for setting that up, including the build watch paths that keep other products from triggering it, are in [wiki/development.md](./wiki/development.md).
