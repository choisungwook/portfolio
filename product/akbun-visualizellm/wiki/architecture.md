# Architecture

One page, no framework, no server. A config goes in, two views come out of the same derived model.

## The pipeline

```text
config.json text
  -> parseConfig()    validate, unwrap a multimodal config
  -> deriveModel()    dims, flags, per-field sources, parameter estimate
  -> buildDiagram()   the 2D block list                -> src/scripts/main.js
  -> buildScene()     the 3D box layout                -> src/scripts/view3d.js
```

Both views read the same model object. A change to how a field is read lands in both at once, and neither view re-derives anything of its own.

## src/lib, which the tests cover

| File | Holds |
|---|---|
| `model.js` | Alias tables, parsing, `deriveModel`, `countParams`, `humanCount`, `summary` |
| `diagram.js` | `buildDiagram` (sections and blocks with roles), `annotations` (field to block targets) |
| `scene.js` | `buildScene` (a box per matrix with a position and a size), `side` (the log scale) |
| `samples.js` | Four configs written the way each family spells its fields |

None of these import anything from the DOM, so `npm test` runs on plain node.

## The derived model

`deriveModel` resolves every field through its alias list and keeps two things: the value, and `sources[key]`, the config field name the value came from. The sources are what make the arrows possible, the config pane highlighting, and the "from hidden_size, rms_norm_eps" line in a tooltip. A field the config never spelled has a `null` source, and everything downstream skips it, which is why a GPT-2 config draws no rotary block and shows no `rope_theta` chip.

`flags` carries the shape decisions that change the drawing: `MHA`/`GQA`/`MQA` from the head counts, whether the MLP is gated, whether the output weights are tied, and the mixture-of-experts counts when there are any.

## The 2D view

`buildDiagram` returns three sections: input, the layer stack, output. The stack is one layer drawn once with its repeat count on the head, because 32 identical drawings teach nothing that "x 32" does not.

Every block carries a `role`, which is the sentence the tooltip shows. Roles are written in the library, not in the DOM code, so they are data and change with the model: the attention role names the actual head split, the MLP role names the actual width.

## The arrow lane

The lane and the blocks are two columns of one grid, and the SVG covers the grid. Chip positions and arrow endpoints are computed once from `getBoundingClientRect` and stored as content coordinates, so scrolling moves the arrows with the blocks for free and no scroll handler exists. Chips are placed at the height of their first target and pushed down when two would collide.

Recomputing is needed only when the content itself moves: a resize, a reload of the config, the switch being toggled, and the web fonts finishing, which shifts every block a few pixels after the first paint.

## The 3D view

`view3d.js` is imported dynamically the first time the 3D button is pressed, so three.js is a separate chunk and never touches the first paint.

`buildScene` places one box per matrix along x, layer after layer, with height and depth log scaled from the matrix dimensions. Log scale is not cosmetic: a vocabulary of 150,000 next to a head dimension of 128 is a thousandfold range that no linear scale can show on one screen.

Colors come from the CSS variables at build time of the scene, so the boxes follow the page theme. The camera opens on the first layers at reading distance, because framing the whole model turns every matrix into a speck; "Fit all" is the button for the other question.

## State

`localStorage` keeps the config text, the view mode and the arrow switch. Nothing else is persisted, and a failure to write is swallowed rather than losing the view.
