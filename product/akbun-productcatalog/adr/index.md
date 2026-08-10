# ADR

Decision records for akbun-productcatalog in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [An Astro static page on Cloudflare Pages](2026-08-astro-static-on-cloudflare.md) - The deployment was copied from akbun-openapiviewer, so there is no release job, no tag and no version a build looks at.
* [The catalog is JSON read from GitHub raw](2026-08-catalog-from-github-raw.md) - The list changes far more often than the page does, and raw makes the edit reach the site without a build.
* [The published copy is the fallback, not a second file](2026-08-published-copy-as-fallback.md) - The build inlines the same file the raw URL serves, so the source and the fallback cannot disagree.
* [The catalog lives beside the products it lists](2026-08-catalog-beside-the-products.md) - Every pull request that adds a product has to update the list, and nobody finds it four directories inside one product's build folder.
* [The repository link is derived from the id](2026-08-repo-link-from-id.md) - Every product is a directory of the same name, so storing the URL twenty times only creates twenty chances to mistype it.
* [Products are web or desktop, and nothing else](2026-08-two-kinds-web-and-desktop.md) - The chips answer how a product is used, not how it is built, and a chip with one product behind it is a link rather than a filter.
* [A bad entry throws instead of being skipped](2026-08-strict-catalog-parsing.md) - The document is edited by hand, and a silent skip hides the typo that dropped a product from the page.
* [The catalog logic lives in a DOM free module](2026-08-dom-free-catalog-module.md) - Parsing, validation, sorting and filtering are the failures worth testing, so they sit where node can test them without a browser.
