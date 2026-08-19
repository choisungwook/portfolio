# A Vite static page on Cloudflare

## Decision

Build the calculator as one Vite-powered static page and deploy its assets to Cloudflare with Wrangler. Use plain HTML, CSS, and JavaScript instead of Astro or a component framework.

## Reason

The page is one interactive calculation surface with no content routes, server rendering, or reusable component tree. Astro would still hand the entire useful part to client-side JavaScript, while a UI framework would add state machinery around a form whose state is already the form.

Vite keeps npm dependency bundling, local development, hashed production assets, and a small configuration surface. Cloudflare serves the generated files without a backend, built by a Cloudflare Pages build on push to master, the same shape as akbun-visualizellm and akbun-rendermermaid. The pull request job only tests arithmetic and builds; there is no release job, no tag and no artifact, so a forgotten version bump cannot silently strand a deployment.
