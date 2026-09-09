# Files first, SQLite as index

## Decision

The raw mirror and the generated wiki are markdown files under one data directory. A single SQLite file holds sync state, API keys, and a full-text index of the wiki that is replaced on every build. Neither the raw text nor the wiki is stored in the reader's D1.

## Reason

- graphify reads a folder and writes a folder. Putting the corpus in a database would mean exporting it to disk before every build anyway.
- Markdown files are what an LLM, Obsidian, or a git diff can read without this service. The database is disposable; the files are not.
- The API needs search over article bodies and needs keys that survive a rebuild. FTS5 in the standard library covers search, and one table covers keys, without a database server.
- Replacing the whole article table per build is simpler than diffing communities graphify renames between runs, and a build of a few hundred articles takes well under a second to index.
