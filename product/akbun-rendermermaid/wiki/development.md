# Development

Node and npm only. There is no Rust toolchain, no app binary and no platform requirement.

## Run

Start the dev server with hot reload:

```bash
cd product/akbun-rendermermaid/workspace
npm install
npm run dev
```

## Test

The tests cover `src/lib/diagram.js`, which is DOM free, so they run without a browser and without a build:

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

The build warns that a chunk is over 500 kB. That chunk is mermaid, it is expected, and splitting it would only move the same bytes into a second request the page needs anyway.

## Deploy

Cloudflare Pages builds on push to master. There is no GitHub Actions release job and no tag, so nothing breaks when the version in `package.json` stands still. It is bumped anyway, by the repository rule that a change under `workspace/` carries one, and it reads as a note about how far the page has moved rather than as something a build looks at.

First time setup, once:

1. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Pick `choisungwook/portfolio`.
3. Build settings:
   - Build command: `cd product/akbun-rendermermaid/workspace && npm install && npm run build`
   - Deploy command: `cd product/akbun-rendermermaid/workspace && npm run deploy`
   - Build output directory: `product/akbun-rendermermaid/workspace/dist`
   - Root directory: `/`, since this is a monorepo
4. Custom domains, add `mermaid.akbun.com`. Cloudflare writes the CNAME and issues the certificate.
5. Settings, Builds & deployments, Build watch paths:
   - Include: `product/akbun-rendermermaid/**`
   - Exclude: `product/akbun-rendermermaid/*.md`

Without the watch paths every commit anywhere in the repository triggers a build of this page.

## Caveats

**Do not turn `htmlLabels` back on.** It renders nicer labels and it silently breaks Save PNG: HTML labels live in a `foreignObject`, and a canvas drawing an SVG image leaves that area blank. The diagram exports with its boxes and arrows and no text at all. The same applies to any webfont in `fontFamily`, which is why the config names a system stack.

**Check the export after touching the render path.** The preview and the PNG go through different code in the browser, so a diagram can look correct on screen and export blank or clipped. Rendering it and saving it once is the check.

**The 8192 px cap is a floor, not a guess.** Canvas limits differ by browser and by device; 8192 is the smallest still in the field. Raising it would fail on the machines that most need the export to work.

**Mermaid updates change output.** The exact markup mermaid emits is what the sizing code reads. After bumping mermaid, render a flowchart and a sequence diagram, save each as PNG, and open the large view once. The unit tests cover the string handling but they cannot notice that mermaid started emitting something else.
