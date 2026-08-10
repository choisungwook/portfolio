# The catalog is JSON read from GitHub raw

## Decision

Keep the product list in `products.json` and fetch it from `raw.githubusercontent.com` when the page loads, rather than importing it at build time or writing the cards into the page.

## Reason

The list changes on a different clock from the page. A product is added every week or two; the layout is touched rarely. Reading the list at runtime means adding a product is an edit to one JSON file, visible on the live site once master has it, with no Cloudflare build standing between the edit and the reader. Building it in would make every product addition a code change and a deploy.

Raw is the cheapest host that already holds the file: no bucket, no API, no token, and `access-control-allow-origin: *` so the browser may read it cross-origin. The cost is a few minutes of raw's cache and one network request the page can fail at, which is what the fallback covers.
