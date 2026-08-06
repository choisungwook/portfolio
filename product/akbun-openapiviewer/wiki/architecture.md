# Architecture

One static page, no backend, no API surface. Astro builds `src/pages/index.astro` into a single HTML file plus one JavaScript bundle that carries the YAML parser. Cloudflare serves those files and nothing else runs anywhere.

## The split that matters

There are two JavaScript files and the line between them is the only structural decision in the project.

| File | Holds | Tested by |
|---|---|---|
| `src/lib/spec.js` | Parsing, flattening, search, paging, `$ref` resolution, schema text. Plain functions over objects and strings | `node --test`, no browser |
| `src/scripts/main.js` | Everything that touches the DOM and `localStorage` | The browser |

`spec.js` imports only `js-yaml`. That is what lets the pull request job run the tests on a bare ubuntu runner in seconds. `main.js` is a wiring file: it reads elements by id, holds the view state, and hands anything that needs logic to `spec.js`.

## The view model

State is one object: the parsed spec, the flattened operation list, the search query, and a view that is either `{kind: 'all', page}` or `{kind: 'op', id}`. Every change re-renders the sidebar and the detail pane from that state; nothing merges partial updates into the DOM.

Operations are flattened once at load time by `listOperations`. Each entry carries its method, path, summary, tags and the operation object itself, with path-level parameters merged in there so the rest of the code never has to know OpenAPI allows them in two places. The `id` is `method path`, which is unique by construction within a document.

## Search

`filterOperations` lowercases the query, splits it on whitespace, and keeps an operation only when every word appears somewhere in its method, path, summary, operationId or tags. Filtering runs on every keystroke over the in-memory array; there is no debounce because filtering a few thousand short strings is far below the frame budget. Ctrl/Cmd + K focuses the search from anywhere on the page.

## The all-APIs view and why it pages

The all view renders the same full detail card used for a single operation, for every visible operation. A large spec has hundreds of operations, each with several schema `<pre>` blocks, and rendering them all at once makes the first paint take seconds. `pageSlice` clamps the page into range and hands back 10 at a time; Prev/Next re-render only the detail pane. The sidebar list is not paged, because a list of one-line buttons is cheap at any size the browser can hold the spec at.

Search and paging compose: the page is cut from the filtered list, and typing resets to page 1.

## Layout across screen sizes

There are two layouts and one breakpoint that matters, 720px. Above it the header, the sidebar and the detail pane sit side by side as they always have; 900px only shrinks the type and the sidebar's share.

Below 720px the sidebar leaves the flow. It becomes a fixed drawer over the detail pane, the header grows a hamburger button, and a backdrop sits between the two. `main.js` holds the open flag in `state.drawer` and `syncDrawer` is the only function that touches the DOM for it: it toggles the class, shows the backdrop, sets `aria-expanded`, and marks the pane `inert` while it is off screen so nothing inside it takes focus or is read out. The breakpoint is written twice, as a media query in `global.css` and as a `matchMedia` in `main.js`, and the two have to be changed together. Widening past the breakpoint clears the flag, so a rotation never lands on an open drawer.

Picking an operation, loading a spec and Escape all close the drawer. Ctrl/Cmd + K opens it first, because the search box lives inside it. The loader dialog does not focus its textarea on a phone, where that would throw the keyboard over the dialog before it has been read.

The app shell is `100dvh`, not `100vh`, so the browser chrome does not cut off the bottom of the detail pane, and the document itself never scrolls: the drawer and the detail pane scroll inside themselves with `overscroll-behavior: contain`.

The parameter table is the one piece that does not use the breakpoint. Five columns wide, it sits in a `.table-wrap` that scrolls sideways on its own, and `.op` is a query container so that a card narrower than 33rem drops the header row and turns each parameter into a labelled block, its cells printing their column name from `data-label`. It has to be a container query because card width and window width disagree: the split leaves a card 444px on a 768px tablet, while a 600px phone with the list in a drawer gives that same card 573px. Without the wrapper underneath it, the table pushed the whole document sideways and every other element inherited the misalignment.

## Schema rendering

`schemaText` turns a schema into an indented text tree shown in a `<pre>`. `$ref`s are resolved in place and prefixed with their name (`Pet — object`), required properties carry `*`, scalars show their format and enum, and `allOf`/`oneOf`/`anyOf` become labelled lists. Two guards keep it finite: a ref already on the resolution path renders as `(circular)`, and depth past 6 becomes `…`.

Text rather than a collapsible tree was deliberate. The output is greppable with the browser's find, needs no per-node event handling, and one function covers every schema shape. The day interactive collapsing is wanted, it replaces one function and one CSS class.

`resolveRef` walks local `#/` JSON pointers only, with `~0`/`~1` unescaping. Remote and file refs render as `(unresolved $ref)` instead of failing the page, because fetching them would make the page a network client and most pasted specs are self-contained.

## Loading and storage

`parseSpec` tries JSON when the text starts with `{`, because `JSON.parse` produces the better error message, and hands everything else to `js-yaml`, which accepts JSON anyway. It rejects documents without `openapi`/`swagger` or `paths` with a message saying which field is missing; that message lands in the loader dialog.

The raw text, not the parsed object, is kept in `localStorage` under one key and re-parsed on load. Storing the source keeps the stored form identical to what the user pasted and survives changes to the parsed shape. A quota failure is swallowed: the page still works, it just starts empty next time. A stored spec that no longer parses is dropped and the loader opens.
