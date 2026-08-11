# akbun-openapiviewer

A web page that shows an OpenAPI spec as a browsable API reference. Import a file or paste the document as JSON or YAML, read the API list on the left and each operation's detail on the right. No account, no upload, no server: the spec is parsed in the browser that opened the page.

Deployed as a static Astro build on Cloudflare at [openapiviewer.akbun.com](https://openapiviewer.akbun.com).

## What it does

| Feature | How it works |
|---|---|
| Load | Paste JSON or YAML, open a `.json`/`.yaml` file, or start from the bundled sample. A document without `openapi` or `paths` is rejected with the reason |
| Spec title | The loaded document's title and version sit at the top of the left pane, above the search box, rather than beside the app's own name where they read as a subtitle of the viewer |
| API list | Every path and method flattened into one list on the left: method badge, path, summary. Clicking one shows its detail on the right |
| All APIs | The top item of the list, the one item that never scrolls away. The right pane shows every operation as a card, 10 per page with Prev/Next, so a thousand-operation spec does not freeze the first paint |
| Search | The search bar filters live on every keystroke, no Enter needed. Ctrl/Cmd + K focuses it. Every word must match, over method, path, summary, operationId and tags |
| Detail | Parameters as a table (path-level parameters merged in), request body and responses per content type, schemas as an indented tree with `$ref`s resolved in place, `*` marking required properties and circular refs cut off |
| Request snippets | Each card writes the call as curl, python httpx or python requests, wrapped across lines or on one line, with a Copy button. Built from the first declared server, the required parameters and an example body derived from the request schema |
| Export JSON | The header button saves the loaded document as JSON, named from `info` (`petstore-sample-1.0.0.json`). Loading YAML and exporting is how a YAML spec comes back out as JSON |
| Restore | The spec is kept in `localStorage`, so a reload or a closed tab does not lose it |
| Phone | Below 720px the API list becomes a drawer opened from the header, so an operation gets the whole screen, and each parameter reads down a card instead of across a table too wide to fit |

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/pages/` | The single Astro page: the sidebar, the detail pane, the loader dialog |
| `workspace/src/scripts/` | The DOM side. Rendering, event wiring, `localStorage` |
| `workspace/src/lib/` | Parsing, search, paging and schema formatting, none of which touch the DOM |
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

Deployment is a Cloudflare Pages build on push to master. The setup steps are in [wiki/development.md](./wiki/development.md).
