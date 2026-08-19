# Rust core with a native AppKit shell

## Decision

The model, the sessions and the protocol are a Rust crate. The window is an AppKit executable that links it. The repository's default stack for a desktop app is a webview framework, and this product does not use it.

## Reason

A terminal view is the body of this app, not an element on a page. In a webview shell a native terminal view has to be overlaid on the webview and kept in step with it by hand: two coordinate systems, a z order, and a scroll position that belongs to neither. That work is permanent, and it is in the way of every later change.

The parts that must last are also not screen parts. Session lifetime, project state and the agent state detection this product exists for all live below the screen, and one of them reads the byte stream the view draws. Putting them in a crate with no screen dependency means they are tested with `cargo test` on a Linux runner in seconds, and they survive a rewrite of the window.

The cost is honest: two languages, a hand written header, and a link step that is the most likely thing to break. That cost is paid once, at the boundary, and it is bounded by keeping the C surface at five functions.

## Alternatives

- **Webview shell.** The cheapest sidebar, file browser and markdown view, and the overlay problem above forever.
- **A terminal UI running inside another terminal.** Smallest surface of all, and it gives up the file browser, the rendered markdown and the browser menu that were asked for.
