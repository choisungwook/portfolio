# Copy akbun-reader: one Worker, D1, Access, tokens

## Decision

Start the product as a copy of akbun-reader's workspace: one Cloudflare Worker serving the page from its assets binding and the API under `/api/*`, D1 for data, Cloudflare Access with one Google account in front of the hostname, and Worker-issued API tokens for automation. `worker/auth.ts` is the same file. The first design's own OAuth login, session cookie, and account merging are dropped.

## Reason

- One user. A login gate, a session table, and provider adapters were the bulk of the original first issue, and Access replaces all of it with a policy and a JWT check.
- Access is per hostname, so the same auth code works if the origin later moves behind a Cloudflare Tunnel. The deployment can change without touching the app.
- Workers, D1, Access, and R2 sit inside their free allowances for a few hundred requests a day, and the other web products already deploy this way.
- The remaining OAuth in the app is channel linking, which is a different credential with a different scope and lifetime anyway.
