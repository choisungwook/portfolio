# A separate service instead of a reader feature

## Decision

Build the wiki in its own product, `akbun-wiki`, as a Python service that pulls from the reader. The reader gains only a read-only token scope. graphify runs as an external command in this service; nothing of it is ported into the Worker.

## Reason

- graphify is a Python 3.10+ CLI. It parses with tree-sitter, keeps a cache on disk, and calls an LLM backend for markdown. A Cloudflare Worker is a V8 isolate with a 10 ms CPU budget on the free tier and no filesystem, so none of that runs there.
- Rewriting graphify's extraction and clustering in TypeScript would trade a maintained tool for a private fork. The wiki is a derived view; the tool that builds it can be swapped later without touching the reader.
- The reader already has the sync contract this needs: a change log with a monotonic sequence number, built for the CLI export. A second consumer costs the reader one token scope and no new endpoint.
- Keeping the wiki out of D1 keeps the reader inside its free-tier storage and request budget, which was the reason for its hosting choice.
