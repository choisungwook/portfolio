# Access for the browser, Worker tokens for automation

## Decision

Put Cloudflare Access with Google login in front of the hostname and allow exactly one account. Clients without a browser session (the iOS Shortcut, the CLI, MCP clients) authenticate with an API token issued from the settings page and sent as a Bearer header. The Worker verifies the Access JWT on one path and the token hash on the other; both paths end in Worker code. No IP allow-list.

## Reason

- Access removes the login screen, session store, and OAuth callback from the product. The Worker's auth code shrinks to JWT verification and a hash lookup.
- Automation clients cannot hold an Access cookie, so they need their own credential anyway; a token table is the smallest thing that works.
- Verifying in the Worker matters because Access is per hostname. `workers_dev` and preview URLs are disabled for the same reason.
- An IP allow-list would lock the owner out on a mobile network and does not distinguish people behind one public address.
- The earlier design's guest "login succeeded" screen is dropped: Access rejects other accounts before they reach the page, so the app has no guest state to render.
