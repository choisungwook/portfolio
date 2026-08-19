# A Vite static page on Cloudflare

## Decision

Build the calculator as one Vite-powered static page and deploy its assets to Cloudflare with Wrangler. Use plain HTML, CSS, and JavaScript instead of Astro or a component framework.

## Reason

The page is one interactive calculation surface with no content routes, server rendering, or reusable component tree. Astro would still hand the entire useful part to client-side JavaScript, while a UI framework would add state machinery around a form whose state is already the form.

Vite keeps npm dependency bundling, local development, hashed production assets, and a small configuration surface. Cloudflare serves the generated files without a backend. The release workflow can test arithmetic and build on pull requests, then use the same locked Wrangler dependency to deploy from `master`.
