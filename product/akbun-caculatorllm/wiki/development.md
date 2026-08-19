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

The release workflow runs tests and a production build for pull requests. A push to `master` repeats verification and deploys the static `dist/` directory through Wrangler.

Create two GitHub Actions secrets before the first deployment:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `CLOUDFLARE_API_TOKEN` | Token allowed to edit Workers scripts for the account |

The worker name is `akbun-caculatorllm`. Add `caculatorllm.akbun.com` as its custom domain after the first deployment. The Open Graph metadata already uses that hostname.

Deploy from a trusted local shell when the workflow is not used:

```bash
npm run build
npm run deploy
```

No GitHub tag or binary release is created. `package.json` remains the product version record and must be bumped with each change under `workspace/`.

## Release

1. Bump `workspace/package.json` using semver.
2. Update `RELEASE_NOTES.md`.
3. Run `npm test`.
4. Run `npm run build`.
5. Merge to `master` only after pull request verification passes.
6. Confirm the master workflow deploy job and the custom domain.

## Caveats

**Use measured rates from one complete replica.** The calculator multiplies these rates by the number of complete replicas. Supplying an already aggregated system rate multiplies capacity twice.

**Keep benchmark conditions aligned.** A rate measured with a short prompt, different quantization, or different concurrency does not describe the workload entered in the calculator.

**Do not turn latency into a guarantee.** TTFT and inter-token latency are service-time estimates from aggregate rates. The page does not model a queue or tail percentiles.

**Treat KV cache as a ceiling.** Runtime overhead and attention implementations can lower it. Validate with `vllm:kv_cache_usage_perc` and production sequence counts.

**Update the social image with the result example.** `public/og.png` shows the default 4.25 req/s result. Change the image or keep that example stable when changing defaults.
