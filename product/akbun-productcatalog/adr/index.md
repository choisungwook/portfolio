# ADR

Decision records for akbun-productcatalog in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [An Astro static page on Cloudflare Pages](2026-08-astro-static-on-cloudflare.md) - The deployment was copied from akbun-openapiviewer, so there is no release job, no tag and no version a build looks at.
* [The catalog is JSON read from GitHub raw](2026-08-catalog-from-github-raw.md) - The list changes far more often than the page does, and raw makes the edit reach the site without a build.
* [The published copy is the fallback, not a second file](2026-08-published-copy-as-fallback.md) - One file in `public/` is both the raw source and the site's own copy, so the two cannot disagree.
* [The repository link is derived from the id](2026-08-repo-link-from-id.md) - Every product is a directory of the same name, so storing the URL twenty times only creates twenty chances to mistype it.
* [A bad entry throws instead of being skipped](2026-08-strict-catalog-parsing.md) - The document is edited by hand, and a silent skip hides the typo that dropped a product from the page.
* [The catalog logic lives in a DOM free module](2026-08-dom-free-catalog-module.md) - Parsing, validation, sorting and filtering are the failures worth testing, so they sit where node can test them without a browser.
