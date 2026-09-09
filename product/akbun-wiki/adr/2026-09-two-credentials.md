# Read-only reader token and wiki API keys

## Decision

The service authenticates to the reader with a token issued with scope `read`; the reader rejects writes and MCP for it. Clients of this service authenticate with API keys issued from the CLI, stored as SHA-256 hashes, with role `read` or `admin`. Only `admin` may trigger a sync. There is no login page, no session, and no OAuth.

## Reason

- The reader token lives on another machine. If that machine leaks it, a read-only scope limits the damage to reading what the owner already reads; a full token could retag or archive everything.
- Cloudflare Access cannot front this service the way it fronts the reader, because the service runs wherever the owner has Python and a filesystem. A Bearer key checked in one function is the smallest working guard and mirrors the reader's own token path.
- LLM clients send a static header well and hold a browser session badly, which is the same reason the reader's MCP endpoint takes Bearer tokens.
- Splitting `read` from `admin` keeps a leaked LLM key from spending LLM budget through repeated builds.
- Keys are minted on the host, so the only user database is the key table. A multi-user wiki would need per-user visibility rules that this owner does not have.
