# Development

Node and npm only. There is no Rust toolchain, no app binary and no platform requirement.

## Run

Start the dev server with hot reload:

```bash
cd product/akbun-visualizellm/workspace
npm install
npm run dev
```

## Test

The tests cover `src/lib`, which is DOM free, so they run without a browser and without a build:

```bash
npm test
```

This is what the pull request job runs, together with a build to prove the page still compiles.

## Build

Produce the static site in `dist/` and serve it locally:

```bash
npm run build
npm run preview
```

The build warns that a chunk is over 500 kB. That chunk is three.js, and it is already split out of the entry: the warning is about its size, not about it loading on the first paint.

## Deploy

Cloudflare Pages builds on push to master. There is no GitHub Actions release job and no tag, so nothing breaks when the version in `package.json` stands still. It is bumped anyway, by the repository rule that a change under `workspace/` carries one.

First time setup, once:

1. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Pick `choisungwook/portfolio`.
3. Build settings:
   - Build command: `cd product/akbun-visualizellm/workspace && npm install && npm run build`
   - Deploy command: `cd product/akbun-visualizellm/workspace && npm run deploy`
   - Build output directory: `product/akbun-visualizellm/workspace/dist`
   - Root directory: `/`, since this is a monorepo
4. Custom domains, add `visualizellm.akbun.com`. Cloudflare writes the CNAME and issues the certificate.
5. Settings, Builds & deployments, Build watch paths:
   - Include: `product/akbun-visualizellm/**`
   - Exclude: `product/akbun-visualizellm/*.md`

Without the watch paths every commit anywhere in the repository triggers a build of this page.

## Caveats

**A config field is read through an alias list, never directly.** Adding a field means adding it to `FIELD_ALIASES` in `model.js` and nowhere else. Reading `config.hidden_size` somewhere in the DOM code is how the page starts working for one model family and quietly failing for another.

**Keep the source with the value.** Everything that points at the config, the arrows, the highlighted lines and the tooltip footers, works off `model.sources`. A new value derived without recording which field it came from cannot be pointed at.

**The parameter estimate is checked against the 3D scene.** `scene.test.js` asserts the boxes add up to `countParams` within one percent. If a matrix is added to one and not the other, that test is what says so, and it is the reason to change both together.

**The arrows live in content coordinates.** They are drawn once from element rectangles and are correct only while nothing has moved. Anything that changes layout, including a font load, has to call `layoutLane()` again.

**Blocks are built as HTML strings.** Every value that came from the config goes through `esc()` before it is interpolated. A pasted config is untrusted input; skipping the escape on a new field is a script injection on a page that stores state in `localStorage`.

**Framing the whole model is the wrong opening shot.** A 32 layer model is several hundred units long and a few units wide, so it renders as a diagonal thread. The camera opens near the embedding; that is deliberate, not an unfinished default.
