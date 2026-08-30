# Development

Node and npm only. The page has no backend, browser test dependency, or application binary.

## Run

Install dependencies and start Vite:

```bash
cd product/akbun-caculatorllm/workspace
npm install
npm run dev
```

## Test

Run the DOM-free calculation tests:

```bash
npm test
```

The tests cover separate model-load and workload totals, model memory, KV cache, extra memory, Fits and OOM states, weight formats, config-derived parameter estimates, exact Hugging Face metadata, and input validation.

## Build

Produce static assets and preview them locally:

```bash
npm run build
npm run preview
```

## Deploy

Cloudflare Pages builds on push to master. There is no GitHub Actions release job and no tag, so nothing breaks when the version in `package.json` stands still. It is bumped anyway, by the repository rule that a change under `workspace/` carries one.

First time setup, once:

1. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Pick `choisungwook/portfolio`.
3. Build settings:
   - Build command: `cd product/akbun-caculatorllm/workspace && npm install && npm run build`
   - Deploy command: `cd product/akbun-caculatorllm/workspace && npm run deploy`
   - Build output directory: `product/akbun-caculatorllm/workspace/dist`
   - Root directory: `/`, since this is a monorepo
4. Custom domains, add `caculatorllm.akbun.com`. Cloudflare writes the CNAME and issues the certificate. The Open Graph metadata already uses that hostname.
5. Settings, Builds & deployments, Build watch paths:
   - Include: `product/akbun-caculatorllm/**`
   - Exclude: `product/akbun-caculatorllm/*.md`

Without the watch paths every commit anywhere in the repository triggers a build of this page.

Deploy from a trusted local shell when the Pages build is not used:

```bash
npm run build
npm run deploy
```

## Release

1. Bump `workspace/package.json` using semver.
2. Update `RELEASE_NOTES.md`.
3. Run `npm test`.
4. Run `npm run build`.
5. Merge to `master` only after pull request verification passes.
6. Confirm the Cloudflare Pages build and the custom domain.

## Caveats

**Treat uploaded config as a shape description.** A `config.json` normally does not contain an exact parameter total. The calculator estimates common decoder-only shapes and asks for manual input when the structure is unsupported.

**Choose the loaded weight format explicitly.** Checkpoints and runtime quantization can differ. Use the format that the server will load.

**Use concurrency as a memory reservation assumption.** KV cache assumes every concurrent request reaches the selected maximum context.

**Treat extra memory as a reserve.** The default 20% groups activations, workspaces, runtime allocations, and fragmentation. Real usage depends on the serving engine and workload.

**Update the social image when the default state changes.** Keep `public/og.png` aligned with the current product.
