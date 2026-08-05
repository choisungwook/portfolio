# An Astro static page on Cloudflare Pages

## Decision

Build the viewer as a static Astro page, deployed by a Cloudflare Pages build on push to master, the same shape as akbun-rendermermaid. The pull request job only tests and builds; there is no release job, no tag and no artifact.

## Reason

The product is a page that parses text in the browser. Nothing needs a server, so the cheapest deployment that already works in this repository wins: the Pages project, watch paths and custom domain routine were all debugged once for akbun-rendermermaid and copy over unchanged. A release workflow with tags would add the silent-failure modes the product rules warn about while delivering nothing a static host does not.
