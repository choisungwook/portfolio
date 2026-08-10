# An Astro static page on Cloudflare Pages

## Decision

Build the catalog as a static Astro page, deployed by a Cloudflare Pages build on push to master, the same shape as akbun-openapiviewer and akbun-rendermermaid. The pull request job only tests and builds; there is no release job, no tag and no artifact.

## Reason

The page fetches one JSON file and draws cards from it, so nothing needs a server and the cheapest deployment that already works in this repository wins. The Pages project, watch paths and custom domain routine were debugged once for the earlier pages and copy over unchanged. A release workflow with tags would add the silent-failure modes the product rules warn about while delivering nothing a static host does not.
