# The published copy is the fallback, not a second file

## Decision

Have the page fall back to a copy of `products.json` that the build inlines from the one file the raw URL serves. Do not keep a separate bundled snapshot of the list.

## Reason

A page whose only data source is a third-party host shows an empty grid whenever that host is unreachable, blocked by a corporate network, or answering 404 because the file is not on master yet. A fallback fixes that, but a hand-maintained second copy would drift, and a drifted fallback is worse than none: it shows a list nobody wrote.

The fallback therefore has to be produced from the same file, never written. The first form of this was `workspace/public/data/products.json`, which Astro published as a site asset. Once the catalog moved to `product/products.json` (see [The catalog lives beside the products it lists](2026-08-catalog-beside-the-products.md)) `public/` could no longer reach it, so `index.astro` imports the file and writes it into a `#catalog-fallback` script element instead. The mechanism changed; the property did not. One file, two routes, and they cannot disagree beyond the age of the last build.

The footer names whichever route answered, so a stale page is visible rather than silent.
