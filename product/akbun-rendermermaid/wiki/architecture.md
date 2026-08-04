# Architecture

One static page, no backend, no API surface. Astro builds `src/pages/index.astro` into a single HTML file plus one JavaScript bundle that carries mermaid. Cloudflare serves those files and nothing else runs anywhere.

## The split that matters

There are two JavaScript files and the line between them is the only structural decision in the project.

| File | Holds | Tested by |
|---|---|---|
| `src/lib/diagram.js` | Sizing, zoom and naming. Plain functions over strings and numbers | `node --test`, no browser |
| `src/scripts/main.js` | Everything that touches the DOM, mermaid, the canvas or `localStorage` | The browser |

`diagram.js` imports nothing. That is what lets the pull request job run the tests on a bare ubuntu runner in a couple of seconds, and it is also where the awkward parts live: reading an SVG's real size, pinning that size onto the markup, capping the export scale, clamping zoom.

`main.js` is a wiring file. It reads elements by id, calls mermaid, and hands anything that needs arithmetic to `diagram.js`.

## Render loop

Typing writes to `localStorage` and schedules a render 400 ms later. The Render button and Ctrl/Cmd + Enter clear that timer and render immediately.

Each render takes a sequence number. `mermaid.render` is asynchronous, so a slow render started two keystrokes ago can finish after a fast one started later; the render compares its own number against the current one and drops its result if it lost. Without this the preview flickers back to older diagrams while you type.

`mermaid.parse` runs before `mermaid.render` because it is the call that produces the readable error, with the offending line and a caret. On failure the preview is left untouched and only the status bar changes, so an unfinished line does not blank the diagram you are working from.

Mermaid builds a hidden measuring node under `body` while rendering and leaves it behind when the render throws. The `finally` block removes it. Left alone these accumulate one per failed keystroke.

## Sizing, and why the preview borrows the export code

Mermaid emits `<svg width="100%" style="max-width: 752px">`. Dropped into a box that shrinks to fit its content, `width="100%"` resolves against nothing and the diagram collapses to a fraction of its size. So the render reads the true size out of the `viewBox` and rewrites the markup with explicit pixel width and height, using the same `withExplicitSize` the PNG export uses. CSS then caps it at `max-width: 100%` with `height: auto`, which is what scales an oversized diagram down to the pane.

## PNG export

The browser will rasterize an SVG for you, but only through an `<img>`, and the rules are unforgiving:

1. Serialize the live SVG node. `XMLSerializer` adds the namespace declaration that a bare `innerHTML` copy would be missing.
2. Pin the pixel size and strip `max-width`, or the image draws at the clamped size and the PNG comes out small.
3. Choose a scale. 2x by default, lowered when the long edge would pass 8192 px, which is the smallest canvas limit still in the field. A 7500 px flowchart exports at 1.08x rather than failing.
4. Fill white first. PNG keeps transparency and a transparent diagram is unreadable anywhere dark.
5. Draw, `toBlob`, download through an object URL.

Two mermaid settings exist for this path alone: `htmlLabels: false`, because HTML labels are drawn inside a `foreignObject` that canvas renders as blank space, and a system font stack, because a webfont is not fetched while an SVG is being rasterized. Both make the preview slightly plainer so that the export matches it.

## Large view

The overlay clones the rendered SVG rather than moving it, so the preview stays put behind it and closing needs no restore step.

Zoom is a CSS transform on the SVG. A transform does not change layout size, so the wrapper is given the scaled width and height explicitly; otherwise the stage has nothing to scroll over and a zoomed-in diagram cannot be reached. Panning is pointer events writing `scrollLeft` and `scrollTop`, which works with a trackpad and a touch screen without a second code path.

The overlay declares itself a modal, so it has to take the keyboard with it: opening moves focus to Close and closing hands it back to whatever opened it. Without that, tab walks the toolbar sitting behind the backdrop.

Fit scales up as well as down. SVG is vector, so filling the window costs nothing, and a large view that leaves a small diagram at its original size is not large.

## Storage

`localStorage` holds two keys, the code and the grid setting. There is no history, no named documents and no sharing. Anything more would be the point at which this stops being a page you open and paste into.
