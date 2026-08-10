# Development

Node and npm only. There is no Rust toolchain, no app binary and no platform requirement.

## Run

Start the dev server with hot reload:

```bash
cd product/akbun-productcatalog/workspace
npm install
npm run dev
```

## Test

The tests cover `src/lib/catalog.js`, which is DOM free and network free, so they run without a browser and without a build:

```bash
npm test
```

The last test parses the published `products.json` itself and asserts every entry has a description, a known kind and a repository link inside this repository. A typo in the data file fails here rather than on the site.

## Build

Produce the static site in `dist/` and serve it locally:

```bash
npm run build
npm run preview
```

## Adding a product

1. Add an object to `product/products.json`. `id` is the directory name under `product/`; everything else is optional.
2. Keep the description the same sentence as the row in `product/README.md`. The two are written by hand and drift apart otherwise.

No version bump for a data-only edit any more: the file is outside `workspace/`, so nothing about the site changed.

The live page picks the change up from GitHub raw once master has it, without waiting for the Cloudflare build. The next build is what refreshes the inlined fallback copy.

## Deploy

Cloudflare Pages builds on push to master. There is no GitHub Actions release job and no tag, so nothing breaks when the version in `package.json` stands still. It is bumped anyway, by the repository rule that a change under `workspace/` carries one.

First time setup, once:

1. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
2. Pick `choisungwook/portfolio`.
3. Build settings:
   - Build command: `cd product/akbun-productcatalog/workspace && npm install && npm run build`
   - Deploy command: `cd product/akbun-productcatalog/workspace && npm run deploy`
   - Build output directory: `product/akbun-productcatalog/workspace/dist`
   - Root directory: `/`, since this is a monorepo
4. Custom domains, add `products.akbun.com`. Cloudflare writes the CNAME and issues the certificate.
5. Settings, Builds & deployments, Build watch paths:
   - Include: `product/akbun-productcatalog/**`
   - Exclude: `product/akbun-productcatalog/*.md`

Without the watch paths every commit anywhere in the repository triggers a build of this page.

## Caveats

**The remote URL points at master.** Until the branch is merged, `REMOTE_CATALOG_URL` answers 404 and every load comes from the published fallback. That is the fallback working, not a bug, and the footer says which source answered. Anyone reading the footer during review should expect the fallback there.

**GitHub raw caches for a few minutes.** An edit on master does not show up instantly. Do not chase it with a redeploy; check the footer date first.

**Both link fields are validated, not escaped into safety.** `parseCatalog` rejects any `site` or `repo` that is not http(s). Removing that check to accept a relative link reopens `javascript:` on an href that HTML escaping does not cover.

**The card markup is an HTML string.** Every value that came from the document goes through `esc()` before it is interpolated. A new field added to the card without it is a script injection through a JSON file.

**The chip counts are computed before the kind filter, not after.** If they are computed after, every unselected chip reads 0 and the row becomes useless. The double filter in `render` is deliberate.

**Descriptions are duplicated with `product/README.md`.** There is no build step that reads one from the other, so a renamed or reworded product has to be edited in both. The repository rule already requires touching `product/README.md` and the root `README.md` when a product directory changes; this is a third place.
