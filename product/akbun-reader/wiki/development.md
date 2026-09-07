# Development

Node, npm, and wrangler. No bundler for the page, no browser test dependency, no application binary.

## Run

Apply the schema to the local D1 and start the dev server:

```bash
cd product/akbun-reader/workspace
npm install
npm run migrate:local
npm run dev
```

The page is at the URL wrangler prints; `/api/health` returns JSON.

## Test

Run the DOM-free tests for the pure helpers:

```bash
npm test
```

Type-check the Worker and bundle it without deploying:

```bash
npm run check
```

`check` is what CI runs. It needs no Cloudflare account.

## Migrations

Add a numbered SQL file under `migrations/`. Wrangler records which files have been applied per database, so never edit a file that has already run; add a new one.

```bash
npm run migrate:local
npm run migrate:remote
```

## Deploy

Not set up yet. The deployment issue covers the first-time manual steps: create the D1 database and paste its id into `wrangler.json`, connect the repository to Workers Builds with `product/akbun-reader/workspace` as the root directory, add the custom domain, and configure Access. Once connected, a push to master builds and deploys; there is no GitHub Actions release job and no tag.

The version in `package.json` is bumped on every change under `workspace/` by repository rule, even though nothing reads it yet.

## Caveats

- `workers_dev` and `preview_urls` are `false` on purpose. Access policies are per hostname, so any extra hostname is a way around them.
- `database_id` in `wrangler.json` is a placeholder until the database exists. `wrangler dev` uses a local SQLite file and does not care; `wrangler deploy` will refuse it.
- Keep `worker/lib/` free of Worker types so `node --test` keeps running it as plain JavaScript.
