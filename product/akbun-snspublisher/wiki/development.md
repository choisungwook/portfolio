# Development

Node, npm, and wrangler. No bundler for the page, no browser test dependency.

## Run

Apply the schema to the local D1 and start the dev server:

```bash
cd product/akbun-snspublisher/workspace
npm install
npm run migrate:local
npm run dev
```

The page is at the URL wrangler prints; `/api/health` returns JSON. The three screens run on `src/mock.js` and need no login.

## Test

Run the DOM-free tests. `worker.test.js` bundles the Worker with esbuild and calls `fetch` directly:

```bash
npm test
```

Type-check the Worker and bundle it without deploying:

```bash
npm run check
```

`check` is what CI runs. It needs no Cloudflare account.

## Migrations

Add a numbered SQL file under `migrations/`. Never edit a file that has already run; add a new one.

```bash
npm run migrate:local
npm run migrate:remote
```

## Deploy

Not set up yet. First-time steps, same as akbun-reader: create the D1 database and paste its id into `wrangler.json`, connect the repository to Workers Builds with `product/akbun-snspublisher/workspace` as the root directory, add the custom domain, and configure Access. After that a push to master deploys; there is no GitHub Actions release job and no tag.

Bump the version in `package.json` on every change under `workspace/`.

## Auth settings

- Every `/api/*` path except `/api/health` is denied by default, locally too.
- Access: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_OWNER_SUB` in `.dev.vars` locally and as secrets in production.
- Tokens: rows in `api_tokens` hold a SHA-256 hash; the Bearer value is the 64-hex original.

## Caveats

- `workers_dev` and `preview_urls` are `false` on purpose. Access policies are per hostname.
- `database_id` in `wrangler.json` is a placeholder until the database exists. `wrangler dev` does not care; `wrangler deploy` will refuse it.
- Keep `src/channels.js` and `src/schedule.js` free of DOM access so `node --test` keeps running them.
