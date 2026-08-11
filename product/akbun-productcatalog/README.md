# akbun-productcatalog

A web page that lists every product in this repository's `product/` directory as a card. Search it, filter it by kind, and the button on each card opens that product: its deployed page if it has one, its GitHub release page if it is something you install.

The list is not compiled into the page. It is a JSON document read from GitHub raw at load, so adding a product is an edit to one file.

Deployed as a static Astro build on Cloudflare at [products.akbun.com](https://products.akbun.com).

## What it does

| Feature | How it works |
|---|---|
| Catalog | `products.json` is fetched from GitHub raw on load. Editing it on GitHub changes the live page within the raw cache window, with no Cloudflare build in between |
| Fallback | The same file is published with the site. When raw is unreachable, blocked or slow, the page loads the published copy instead and says which one it used in the footer |
| Cards | Name, kind badge, description, tags and the release date, newest first. Undated entries sort last |
| Buttons | The primary button is whatever puts the product in front of the reader: Site for a deployed page, Download for a release. Repository is always there, but demoted, because source is not what most people came for |
| Repository button | Each card links to `product/<id>` on GitHub. The link is derived from the id, so an entry needs no long URL. An entry that lives elsewhere sets `repo` and overrides it |
| Site button | Shown only for the products that have a deployed page of their own |
| Download button | Shown for the products that ship a GitHub release. `download` is written out rather than derived, because the release tags do not all start with the directory name |
| Search | Filters live on every keystroke, no Enter needed. Ctrl/Cmd + K focuses it, Escape clears it. Every word must match, over name, id, description, kind and tags |
| Kind filter | Chips for web, desktop, backend, skin and reference, each carrying the count it would show. A chip with nothing behind it reads 0 and is disabled |
| Failure | A fetch that fails on both sources shows the reason and a Retry button, not an empty grid |
| Theme | Light and dark from the system setting, with no toggle to get out of sync |

## The data file

`product/products.json`, one level above this directory, next to the products it lists. One object per product:

```json
{
  "id": "akbun-openapiviewer",
  "name": "akbun-openapiviewer",
  "description": "OpenAPI 스펙을 붙여넣거나 파일로 열어 API 목록과 상세를 탐색하는 웹 페이지",
  "kind": "web",
  "tags": ["astro", "openapi"],
  "site": "https://openapi.example.com",
  "download": "https://github.com/choisungwook/portfolio/releases?q=akbun-openapiviewer",
  "released": "2026-08-05"
}
```

`id` is the only required field, and it is the directory name under `product/`. `kind` is one of `web`, `desktop`, `backend`, `skin`, `reference`, and it says how the product reaches its user: opened at a URL, installed on a machine, run as a server by whoever wants it, or pasted into another service's admin page. `reference` is the shelf for the layout libraries, which are none of those. `site`, `download` and `released` are optional. The document's `repoBase` is the GitHub tree URL the id is appended to.

A `web` entry must carry a `site`. A web product whose whole delivery is a URL, listed with nothing to open, is either mis-classified or missing its domain, and either way the card is one nobody can act on. A test over the published file fails rather than letting that reach the site.

The description is the same sentence as the row in [product/README.md](../README.md), so the two move together when a product is added or renamed.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/pages/` | The single Astro page: header, controls, grid, footer |
| `workspace/src/scripts/` | The DOM side. Fetching, rendering, event wiring |
| `workspace/src/lib/` | Parsing, validation, sorting and filtering, none of which touch the DOM or the network |
| `workspace/src/styles/` | The stylesheet |
| `../products.json` | The catalog itself, one level up in `product/`, both the source of truth and the inlined fallback |
| `workspace/test/` | Tests over `src/lib` and over `product/products.json`, run on plain node with no browser |
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
