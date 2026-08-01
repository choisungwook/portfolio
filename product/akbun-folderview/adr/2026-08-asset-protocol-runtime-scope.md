# The asset protocol scope is granted at runtime, one added folder at a time

## Decision

Leave `assetProtocol.scope` empty in `tauri.conf.json` and grant the webview its reach from Rust as things are added: `allow_directory` for an added folder, `allow_file` for a file added on its own. The grant lives in memory only, so `lib.rs` re-applies it at start from the stored library. The policy in the same config file names both `img-src` and `media-src` for the asset protocol.

## Reason

A static scope cannot express what this app needs. The photos are wherever the user keeps them, and the config is written long before anyone picks a folder. A bare `**` looks like the answer and is not: it does not match an absolute path. What is left in the config are patterns like the whole drive or the whole home directory, which is a permanent grant, applied on every start, far wider than anything the user asked for.

The runtime grant is narrower and it matches what actually happened. Adding a folder grants that folder; adding a file grants that file rather than the folder holding it, so picking one photo out of a directory does not hand the webview the rest of it. Nothing is reachable that the user did not put in the library.

Keeping the grant in memory is the lazy half of the decision and it holds. Making it survive a restart would mean a scope persistence plugin, which is a dependency and a second copy of a list that already exists. `library.json` is the authoritative record of what was added and is already read during setup, so re-granting is a loop over the roots and a second one over the entries. If the two ever disagree, the stored library wins, which is the direction that cannot leave a stale grant behind.

This was found by running the app, not by reading. With `"scope": ["**"]` in the config everything compiles, the app starts, the library loads, the tree and the counts are correct, and every thumbnail in the grid is a broken image. Nothing in the build or the start-up complains, because from the backend's point of view nothing went wrong. The only place the failure exists is the window.

The policy line is the same lesson a second time. The framework does not add asset protocol sources to the content security policy for you; whatever is written in the config is the entire policy. With `img-src` alone the photos come back and every video tile stays blank, because a video source is checked against `media-src`. Both are named for that reason. The video poster frames also depend on the protocol answering range requests, which it does: `preload="metadata"` with a `#t=0.5` fragment makes the engine fetch a slice and paint that frame. And `index.html` deliberately carries no policy of its own, because a second one would intersect with this and take the asset protocol back out.
