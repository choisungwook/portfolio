# The library is only what you add, and search is a scan over it

## Decision

Index only the folders and files the user explicitly adds. Never crawl the disk and never query a system index. Hold the whole library in memory in the page and answer every search with a linear scan over that array, with no debounce and no round trip to the backend. Derive the folder tree from the indexed paths rather than reading directories.

## Reason

The requirement was a search that feels instant. The usual way to get that over a whole disk is to read the file system journal and keep a database, which is a large piece of engineering: a first-run crawl, a watcher, and a store that has to stay correct across crashes. This app does not need it, because the second requirement removes the problem: search only over what was added.

A hand-picked library is tens of thousands of files, not millions. Tens of thousands of objects fit in memory without thought, and a substring test over them finishes well inside a frame. So the fast path here is not an index at all. It is the absence of one. There is no database to keep in sync, no watcher, no first-run crawl, and nothing to invalidate. A keystroke filters an array that is already in the page.

That decision is why `library.js` is loaded into the page as a plain script rather than reached through a command. Asking the backend on every keystroke would reintroduce exactly the latency the design removes, and would do it for a filter that costs less than the message. Scanning the disk and writing the library stay in Rust, where they belong; what the page does with the library once it has it stays in the page.

Deriving the tree from the same array follows from the same place. The alternative, reading directories on demand, would show folders that search cannot find and files that were never indexed, and the two panels would quietly disagree. One source of truth means the tree count and the search count are the same number because they are computed from the same list.

The honest limits are two. A library far past a few hundred thousand files would make the scan visible, and the upgrade path is an inverted index on name trigrams, noted in the source. And the library only knows what it saw at scan time: new files on disk appear after Rescan, because a watcher on every added folder is a cost this does not need yet.
