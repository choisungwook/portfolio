# Architecture

One static page, no backend, no API surface. Astro builds `src/pages/index.astro` into a single HTML file plus one small JavaScript bundle. Cloudflare serves those files, and the only thing that happens at runtime is a `fetch` for the catalog.

## The split that matters

There are two JavaScript files and the line between them is the main structural decision in the project.

| File | Holds | Tested by |
|---|---|---|
| `src/lib/catalog.js` | Parsing, validation, link building, sorting, filtering, counting. Plain functions over objects and strings, no DOM and no network | `node --test`, no browser |
| `src/scripts/main.js` | Fetching, rendering, event wiring | The browser |

`catalog.js` has no dependencies at all, which is what lets the pull request job run the tests on a bare ubuntu runner in seconds. `main.js` is a wiring file: it reads elements by id, holds the view state, and hands anything that needs logic to `catalog.js`.

## Where the catalog comes from

`products.json` has one home, `workspace/public/data/products.json`, and reaches the page by two routes.

1. `REMOTE_CATALOG_URL`, the GitHub raw URL of that file on master. This is the source of truth at runtime.
2. `LOCAL_CATALOG_URL`, `/data/products.json`, the copy Astro publishes with the site because the file sits in `public/`.

`loadCatalog` tries the remote first and falls back to the local copy. The footer names whichever one answered, so a stale page is visible rather than silent. Both requests carry `AbortSignal.timeout`, because a hung request is worse than a failed one here: without the ceiling, the fallback never gets its turn.

The failure the fallback exists for is a raw URL that is unreachable, blocked by a network, or answering 404 because the file is not on master yet. When both fail the page shows the remote error and a Retry button; the local error is not worth reporting, since it only fails when the whole page failed to load.

## Parsing is strict

`parseCatalog` throws, naming the index of the entry it rejected, when a product has no `id`, carries a `kind` outside the known list, repeats an id, or holds a link that is not `http`/`https`. It does not skip a bad entry, because a document edited by hand is exactly where a silent skip hides the typo that dropped a product off the page.

The URL check is a security boundary, not tidiness. Every link on the page comes from a document fetched over the network and goes straight into an `href`, so a `javascript:` value would be script injection that HTML escaping does not stop. It has to die at the parse.

The repository link is derived rather than stored: `repoBase` plus the id, because every product is a directory of that name under `product/`. An entry that lives somewhere else sets `repo` and overrides it.

## The view model

State is one object: the product list, the search query, the selected kind, and where the data came from. Every change re-renders both the chip row and the grid from that state; nothing merges partial updates into the DOM.

`render` filters twice on purpose. First by the search box alone, which is what the chip counts are computed from, so a chip reading 0 means "not in these results" rather than "click me for an empty grid". Then by the selected kind, which is what the grid draws. Filtering runs on every keystroke over an array of twenty-odd short records, far below the frame budget, so there is no debounce.

The grid is built as an HTML string and assigned once. Every interpolated value goes through `esc()` first. Skipping the escape on a new field is a script injection through a file anyone with commit access edits.

## Layout

`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` gives one column on a phone and as many as fit on a desktop without a media query per breakpoint. The single breakpoint at 560px only stacks the header, which runs out of room before the grid does.

Colours are CSS variables declared once on `:root` and redefined only inside `@media (prefers-color-scheme: dark)`. Nothing outside `:root` names a colour, so the two themes are one list rather than two stylesheets, and there is no toggle to drift out of step with the system setting.
