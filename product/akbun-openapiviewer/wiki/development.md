# Development

Node and npm only. There is no Rust toolchain, no app binary and no platform requirement.

## Run

Start the dev server with hot reload:

```bash
cd product/akbun-openapiviewer/workspace
npm install
npm run dev
```

## Test

The tests cover `src/lib/spec.js`, which is DOM free, so they run without a browser and without a build:

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

## Deploy

Cloudflare Pages builds on push to master. There is no GitHub Actions release job and no tag, so nothing breaks when the version in `package.json` stands still. It is bumped anyway, by the repository rule that a change under `workspace/` carries one, and it reads as a note about how far the page has moved rather than as something a build looks at.

First time setup, once:

1. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Pick `choisungwook/portfolio`.
3. Build settings:
   - Build command: `cd product/akbun-openapiviewer/workspace && npm install && npm run build`
   - Deploy command: `cd product/akbun-openapiviewer/workspace && npm run deploy`
   - Build output directory: `product/akbun-openapiviewer/workspace/dist`
   - Root directory: `/`, since this is a monorepo
4. Custom domains, add the subdomain of `akbun.com` chosen for this page. Cloudflare writes the CNAME and issues the certificate.
5. Settings, Builds & deployments, Build watch paths:
   - Include: `product/akbun-openapiviewer/**`
   - Exclude: `product/akbun-openapiviewer/*.md`

Without the watch paths every commit anywhere in the repository triggers a build of this page.

## Caveats

**js-yaml 5 has no default export.** The import is `import { load } from 'js-yaml'`; `import yaml from 'js-yaml'` fails at runtime under node and at build under Vite. This bit once already.

**The detail pane builds HTML strings.** Every value that came from the spec goes through `esc()` before it is interpolated. A pasted spec is untrusted input; skipping the escape on a new field is a script injection on a page that stores state in `localStorage`.

**Rendering cost lives in the all view.** A single operation card is cheap; hundreds are not, which is why `PAGE_SIZE` exists. If cards grow (examples, headers, links), check a large real spec on the all view before shipping, not just the sample.

**`schemaText` output is part of the UI contract.** The tests assert on its exact strings (`Pet — object`, `name*: string`). Changing the format means updating them together, deliberately.
