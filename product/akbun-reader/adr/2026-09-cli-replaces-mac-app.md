# The CLI replaces the macOS sync app

## Decision

Mirror documents into an Obsidian vault with a Rust CLI command that applies changes after the last synced sequence number, run by hand or on a launchd schedule. The macOS desktop app proposed in the design review is dropped.

## Reason

- Sync is a file-writing loop with no user interface, so a window adds build, signing, and updater work for nothing.
- The same CLI already needs login and API access for saving and listing from a terminal, and it can host an MCP stdio mode later.
- Incremental sync by change number, id-based filenames, and a preserved notes region carry over from the design review unchanged; only the host process changed.
