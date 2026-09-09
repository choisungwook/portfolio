# Read-only tokens for external mirrors

## Decision

Give every API token a scope, `write` by default and `read` on request. A `read` token passes authentication only for GET and HEAD requests on `/api` and `/automation`; writes and the `/mcp` endpoint answer 403. The wiki builder ([akbun-wiki](../../akbun-wiki/)) holds a `read` token and nothing else. Scope is chosen at issuance and cannot be changed afterwards; issue a new token instead.

## Reason

- A second service that pulls the change log needs a credential that lives on another machine. A stolen full token could save, retag, and archive documents; a stolen read token can only read what the owner already reads.
- The change log endpoint is already the sync contract for the CLI, so a read token needs no new API. Scope is one column and one branch in the router.
- Filtering MCP tools by scope would have meant a second tool registry. Rejecting `/mcp` outright keeps the endpoint's contract unchanged: every MCP client is a writer.
- Immutable scope keeps revocation the only state change on a token, which is what the settings page and the tests already cover.
