# An Astro static page on Cloudflare Pages, copied from the envelope simulator

## Decision

Build the page with Astro, output static, and deploy it as Cloudflare Pages assets through `wrangler.json`, the same arrangement `product/envelope_encryption_simulator` already uses. No GitHub Actions release job, no tag, no version to bump. The `version` field in `package.json` names the package and nothing reads it.

## Reason

The deployment was chosen before the framework was, because the deployment is the part that has to be maintained. A page that builds and publishes itself on push, with the CDN and the certificate already handled, is worth more than any property of the build tool. That path exists in this repository and works, so this product copies it rather than inventing a second one.

Astro follows from that. A page with one route and no server-rendered content barely uses a framework, and the smaller answer, plain HTML served straight from `dist`, was genuinely tempting. What decided it was mermaid. Mermaid is an npm package of a size that wants bundling, and reaching it from a CDN `<script>` tag would have traded a build step for a runtime dependency on somebody else's uptime. Once a bundler is in play, using the one the sibling product already uses costs nothing extra to learn.

The cost is a `node_modules` and a build for a page that is mostly markup. It is real, and if mermaid were ever dropped the honest move would be to delete Astro along with it.

The other cost is that a broken build is not visible here the way a failed GitHub Actions run would be. Cloudflare builds after the merge and reports it in its own dashboard, not on the pull request. The verify job answers only half of that: it runs the tests and the build, so a page that cannot compile fails on the pull request, but a deployment that fails in Cloudflare for its own reasons is still something you have to go and look at.
