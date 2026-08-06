# The same page deploys to a Cloudflare Worker with a fetch proxy

## Decision

The web version is the unmodified `src/` page served as Worker static assets, plus one endpoint: `POST /api/proxy`, which performs the fetch server side and returns the same response shape as the Rust engine. `src/api.js` picks the engine by detecting `window.__TAURI__`. TLS verification stays desktop-only; the web build forces it on and the settings dialog says so.

## Reason

- The browser cannot be the engine: CORS blocks arbitrary origins. Moving the fetch into the worker removes CORS entirely, because the page only ever calls its own origin.
- Workers cannot disable TLS verification, so the one desktop-only feature degrades honestly instead of pretending: the toggle is disabled on web with a note pointing at the desktop app.
- One page for both shells means every feature (bookmarks, variables, curl, scenarios) exists on the web for free, with localStorage standing in for the state file.
- Deploying as a Worker follows the pattern the other web products in this repository already use: `wrangler.json` in the workspace, a Cloudflare build connected to the repository, nothing to release from CI.

Accepted risk: `/api/proxy` is reachable by anyone who finds the deployed URL, making it a generic fetch endpoint. The worker checks the Origin header, which stops other sites embedding it but not a curl user. That is the ceiling for a static page with no accounts — this product deliberately has none — and Cloudflare rate limiting is the backstop. Workers also cannot reach private networks, so the proxy exposes nothing internal.
