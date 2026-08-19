# akbun-visualizellm

A web page that reads a model `config.json` and draws the architecture it describes. The 2D view is the whole stack in one column, every block explaining its own job when the pointer rests on it. The 3D view is the same model as every weight matrix it actually holds, sized by its shape and placed along the flow. No account, no upload, no server: the config is read in the browser that opened the page.

Deployed as a static Astro build on Cloudflare at [visualizellm.akbun.com](https://visualizellm.akbun.com).

## What it does

| Feature | How it works |
|---|---|
| Load | Paste a `config.json`, open the file, or start from one of four samples. A JSON object without a hidden size or a layer count is rejected with the reason |
| Field aliases | `hidden_size`, `n_embd`, `d_model` and `dim` are the same field. Each one is read through its alias list, so a GPT-2 era config draws the same as a current one |
| 2D map | Token ids to logits in one column: embedding, the transformer layer drawn once and marked with its repeat count, final norm, LM head. Blocks are colored by what they are, not by where they sit |
| Roles | Hovering any block explains what it does in the model and why it is shaped that way, with its parameter count and the config fields behind it |
| Config arrows | Every config field the diagram used sits in a lane beside the drawing with an arrow into each block its value shaped. The header switch turns the lane off, and hovering a chip, a config line or a block lights up the whole chain |
| 3D view | Every weight matrix as a box, its height and depth log scaled from its real dimensions, laid along the residual stream one layer after another. Orbit, zoom, pan, and hover a box to read the same explanation. Attention scores are drawn translucent because they are built at run time and are not weights |
| Layer and part filter | The 3D view carries a layer slider and a legend that doubles as a switch: isolate one layer of the stack, or hide attention, feed-forward or normalization to see what is left. The embedding and the head stay, because they are what the stack sits between |
| Shape reading | Grouped-query attention shows as K and V boxes visibly thinner than Q; a mixture model shows the router and its expert copies; a tied LM head is named as tied and left out of the count |
| Parameters | Estimated from the shapes alone, per block, per layer and in total, so a config that never shipped a weight file still reports a size |
| Restore | The loaded config, the view mode and the arrow switch are kept in `localStorage` |
| Phone | Below 860px the config pane becomes a drawer and the arrow lane folds into a field list under each block |

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/pages/` | The single Astro page |
| `workspace/src/scripts/` | The DOM side: the 2D drawing, the arrow lane, tooltips, and the three.js view loaded on first use |
| `workspace/src/lib/` | Config parsing, the derived model, the 2D block list and the 3D layout, none of which touch the DOM |
| `workspace/src/styles/` | The stylesheet |
| `workspace/test/` | Tests over `src/lib`, run on plain node with no browser |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |
| `knowledge/` | Reusable notes from building it |

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

Deployment is a Cloudflare Pages build on push to master. The setup steps are in [wiki/development.md](./wiki/development.md).
