# Tauri app and CLI share one Rust core

## Decision

The product is a Tauri app with a plain HTML/JS page. Everything that is not drawing the page — catalog, edit model, decoding, rendering, auto analysis, film looks — is the `makephoto-core` crate, with no tauri dependency. The app shell and the `makephoto` CLI each call it and add nothing of their own beyond argument parsing and the window.

## Reason

The CLI exists so an agent can do anything the app can without driving its window. If the logic lived in the app, the CLI would need either a copy of it or the app running. One crate removes both: the same call imports, edits and renders in either caller.

It also keeps CI cheap. `cargo test -p makephoto-core -p makephoto-cli` builds only the image crate and clap, so the pull request job needs no GTK or WebKit.

Tauri over Electron because nothing here needs a second engine: the app is macOS only for now, and the page is ordinary HTML with no node dependency.
