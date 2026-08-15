# The page owns one state object; shells persist an opaque blob

## Decision

Request folders, variables and settings live in one JSON object owned by the page. Persistence is two commands (`load_state`, `save_state`) that move the serialized string to `state.json` in the app data directory on desktop, and to localStorage on web. Neither shell parses the blob.

## Reason

- One source of truth. The moment Rust also understands the state, every schema change touches two languages and the two copies can drift; the bugs that follow are the hard-to-see kind.
- It makes the web build nearly free: localStorage satisfies the same two-call contract.
- The state is small (text requests, not history), so rewriting the whole file per debounced save costs nothing. Write-then-rename keeps a crash from destroying bookmarks.

The trade-off is that Rust cannot validate or migrate the data. Acceptable while the schema is additive; a versioned migration in `lib.js` is the upgrade path if a breaking change ever lands.
