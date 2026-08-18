# An Astro static page on Cloudflare Pages

## Decision

Build the page as a static Astro site, deployed by a Cloudflare Pages build on push to master, the same shape as akbun-openapiviewer and akbun-rendermermaid. The pull request job only tests and builds; there is no release job, no tag and no artifact.

## Reason

The product reads a text file in the browser and draws it. Nothing needs a server, so the cheapest deployment that already works in this repository wins: the Pages project, the watch paths and the custom domain routine were debugged once and copy over unchanged. A release workflow with tags would add the silent failure modes the product rules warn about while delivering nothing a static host does not.
