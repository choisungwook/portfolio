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

The tests cover topology validation, the separate prefill/decode budget, operational reserve, latency arithmetic, block-rounded KV cache memory, and replica recommendations.

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

**Use measured rates from one complete replica.** The calculator multiplies these rates by the number of complete replicas. Supplying an already aggregated system rate multiplies capacity twice.

**Keep benchmark conditions aligned.** A rate measured with a short prompt, different quantization, or different concurrency does not describe the workload entered in the calculator.

**Do not turn latency into a guarantee.** TTFT and inter-token latency are service-time estimates from aggregate rates. The page does not model a queue or tail percentiles.

**Treat KV cache as a ceiling.** Runtime overhead and attention implementations can lower it. Validate with `vllm:kv_cache_usage_perc` and production sequence counts.

**Update the social image with the result example.** `public/og.png` shows the default 4.25 req/s result. Change the image or keep that example stable when changing defaults.
