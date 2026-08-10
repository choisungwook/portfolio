# The catalog lives beside the products it lists

## Decision

Keep `products.json` at `product/products.json`, not at `product/akbun-productcatalog/workspace/public/data/products.json`. The page reads it from the GitHub raw URL of the new path and inlines the same file at build time as its fallback.

## Reason

The file is a repository-wide index, in the same class as `product/README.md` and the "직접 만든 제품" section of the root README. Every pull request that adds or renames a product has to touch it, and most of those pull requests have nothing to do with this page. A path four directories deep inside one product's build folder is not a path those authors find, and an index nobody updates is an index that lies. `product/products.json` sits where the products are, so the three indexes that have to move together now sit within one directory of each other.

Two smaller things follow. A data-only edit no longer lands under `workspace/`, so it no longer carries a version bump under the product rules; nothing about the site changed when only the list did. And `public/` can no longer publish the file, so the fallback is inlined into the page at build time instead, which is the mechanism change recorded in [The published copy is the fallback, not a second file](2026-08-published-copy-as-fallback.md).

The cost is that this workspace now reads a file above its own root. `index.astro` imports it so Vite resolves the path at build time; `import.meta.url` points at the bundled chunk after a build and `process.cwd()` depends on where npm was invoked, so neither is a safe way to find it.
