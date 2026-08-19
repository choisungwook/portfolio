# akbun-terminal wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit and [development.md](./development.md) for how to build, test and release.

## What the app is

A macOS app that wraps shells. The left sidebar holds projects and their workspace groups, while the main pane runs a terminal. Agent state detection, terminal tabs and the file browser come later.

## Where the risk is

- **The link step, not the code.** This is the only product here that compiles two languages into one binary. `swift build` cannot produce the Rust archive, so `scripts/build-core.sh` runs first and `Package.swift` links `core/target/release` by a fixed relative path. Building from another directory breaks the link, which is why both scripts `cd` to the package root.
- **The header is written by hand.** `Sources/CAkbunTerminalCore/include/akbun_terminal.h` mirrors `core/crates/ffi/src/lib.rs`. Nothing checks them at compile time; `BridgeTests` is what fails when they drift.
- **Wire names are the contract.** The Rust and Swift halves of the protocol are never compiled together. `responses_and_events_keep_their_wire_names` on one side and `ProtocolTests` on the other are what a rename has to trip over.
- **One ownership rule.** Every string the core returns was allocated by Rust and goes back to `akbun_core_string_free`. `CoreBridge` is the only file allowed to hold that pointer, so the rule lives in one place.
- **Events are drained, never pushed.** The core queues; the shell asks on its run loop. Nothing calls back from a reader thread, so no view is ever touched off the main thread.
- **Bytes ride as JSON arrays.** Correct and several times larger than the payload. Acceptable while one session is being proved out, and the first thing to move to its own channel; the protocol version exists for exactly that.
- **The core owns the tree.** The shell supplies the app data directory and folder picker results. Rust validates, stores and returns the complete versioned project state after every mutation.

## Files

| File | Role |
|---|---|
| `core/crates/core/src/protocol.rs` | commands, responses, events, version check |
| `core/crates/core/src/app.rs` | the only interpreter of commands, and the event queue |
| `core/crates/core/src/session.rs` | one shell under a pty, its reader thread and its reaping |
| `core/crates/core/src/tree.rs` | project/workspace model and atomic JSON persistence |
| `core/crates/ffi/src/lib.rs` | the five function C surface |
| `Sources/CAkbunTerminalCore/include/akbun_terminal.h` | the header that mirrors it |
| `Sources/AkbunTerminalCore/Protocol.swift` | the Swift half of the protocol |
| `Sources/AkbunTerminalCore/CoreBridge.swift` | the only file that touches pointers |
| `Sources/AkbunTerminalCore/Release.swift` | version arithmetic and dmg naming, pure |
| `Sources/AkbunTerminalCore/UpdateScript.swift` | the bundle swap script, testable as text |
| `Sources/akbun-terminal/TerminalRendering.swift` | the seam a real terminal engine plugs into |
| `Sources/akbun-terminal/PlainTextTerminalView.swift` | the placeholder view behind that seam |
| `Sources/akbun-terminal/ProjectSidebarView.swift` | project/workspace two-level tree and status presentation |
| `Sources/akbun-terminal/TerminalWindowController.swift` | one window, one session, the drain timer |
| `Sources/akbun-terminal/Updater.swift` | release check, dmg download, bundle swap |
| `scripts/build-core.sh` | the Rust archive the package links |
| `scripts/bundle.sh` | assembles the .app and the dmg |

## What is not here yet

Terminal tabs, agent state detection, the file browser, the markdown viewer and the URL menu. Each has its own issue. When adding one, ask first whether it belongs in the core; the answer is yes unless it is pixels or keystrokes.
