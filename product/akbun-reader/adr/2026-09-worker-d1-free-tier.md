# One Worker with D1 on the free tier

## Decision

Host the API, the static page, and later the MCP endpoint in a single Cloudflare Worker with a D1 database. Serve the page through the assets binding of the same Worker. Deploy with Workers Builds on push to master.

## Reason

- One user, a few hundred requests a day, and roughly 30 MB of text sit far inside the free allowances of Workers and D1, so hosting costs nothing.
- The other web products in this repository already deploy this way, so the account, domain, and build settings are familiar.
- One hostname means one Access policy covers both the page and the API.
- Alternatives cost more or fit worse: a managed Postgres with built-in auth pauses free projects after a week of inactivity, and a free VM adds operations and backups for no benefit at this size.
