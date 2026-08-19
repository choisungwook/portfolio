# akbun-terminal wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit and [development.md](./development.md) for how to build, test and release.

## What the app is

A macOS app that wraps shells. The left sidebar holds projects and their workspace groups, the middle runs the selected workspace's terminal tabs with a markdown pane under them, and the right lists the project's files. Agent state detection comes later.

## Where the risk is

- **The link step, not the code.** This is the only product here that compiles two languages into one binary. `swift build` cannot produce the Rust archive, so `scripts/build-core.sh` runs first and `Package.swift` links `core/target/release` by a fixed relative path. Building from another directory breaks the link, which is why both scripts `cd` to the package root.
- **The header is written by hand.** `Sources/CAkbunTerminalCore/include/akbun_terminal.h` mirrors `core/crates/ffi/src/lib.rs`. Nothing checks them at compile time; `BridgeTests` is what fails when they drift.
- **Wire names are the contract.** The Rust and Swift halves of the protocol are never compiled together. `responses_and_events_keep_their_wire_names` on one side and `ProtocolTests` on the other are what a rename has to trip over.
- **One ownership rule.** Every string the core returns was allocated by Rust and goes back to `akbun_core_string_free`. `CoreBridge` is the only file allowed to hold that pointer, so the rule lives in one place.
- **Events are drained, never pushed.** The core queues; the shell asks on its run loop. Nothing calls back from a reader thread, so no view is ever touched off the main thread.
- **Bytes ride as JSON arrays.** Correct and several times larger than the payload. Acceptable while one session is being proved out, and the first thing to move to its own channel; the protocol version exists for exactly that.
- **The browser reads what is opened, and only that.** `read_directory` answers one level. The outline view asks for children inside `numberOfChildrenOfItem`, which is the moment a folder is opened, so nothing below a closed folder has been read. Dotfiles are hidden and symlinks are leaves, both decided in the core.
- **A document is data, never markup.** Markdown arrives as blocks and is drawn as an attributed string. Raw HTML is dropped in the core and links are not clickable, so opening a file someone else wrote cannot reach anything.
- **The core owns the tree.** The shell supplies the app data directory and folder picker results. Rust validates, stores and returns the complete versioned project state after every mutation.

## Files

| File | Role |
|---|---|
| `core/crates/core/src/protocol.rs` | commands, responses, events, version check |
| `core/crates/core/src/app.rs` | the only interpreter of commands, and the event queue |
| `core/crates/core/src/session.rs` | one shell under a pty, its reader thread and its reaping |
| `core/crates/core/src/tree.rs` | project/workspace model, chosen theme, atomic JSON persistence |
| `core/crates/core/src/browse.rs` | one directory level, hidden files and link rules |
| `core/crates/core/src/markdown.rs` | markdown to blocks, and the place raw HTML is dropped |
| `core/crates/core/src/theme.rs` | the known colour schemes as a hex table |
| `core/crates/ffi/src/lib.rs` | the five function C surface |
| `Sources/CAkbunTerminalCore/include/akbun_terminal.h` | the header that mirrors it |
| `Sources/AkbunTerminalCore/Protocol.swift` | the Swift half of the protocol |
| `Sources/AkbunTerminalCore/CoreBridge.swift` | the only file that touches pointers |
| `Sources/AkbunTerminalCore/Release.swift` | version arithmetic and dmg naming, pure |
| `Sources/AkbunTerminalCore/UpdateScript.swift` | the bundle swap script, testable as text |
| `Sources/akbun-terminal/TerminalRendering.swift` | the seam a real terminal engine plugs into |
| `Sources/akbun-terminal/SwiftTermTerminalView.swift` | the emulator behind that seam |
| `Sources/akbun-terminal/TerminalTabBarView.swift` | the tab strip for the selected workspace |
| `Sources/AkbunTerminalCore/TerminalTabs.swift` | which session belongs to which workspace, and which is on screen |
| `Sources/akbun-terminal/ProjectSidebarView.swift` | project/workspace two-level tree and status presentation |
| `Sources/akbun-terminal/FileBrowserView.swift` | the outline view that reads a folder when it is opened |
| `Sources/akbun-terminal/MarkdownDocumentView.swift` | one pane, preview and source, save and the unsaved question |
| `Sources/akbun-terminal/MarkdownAttributedText.swift` | blocks to one attributed string |
| `Sources/AkbunTerminalCore/Theme.swift` | hex to bytes, the only part of a theme that can be wrong |
| `Sources/akbun-terminal/TerminalWindowController.swift` | one window, the tabs it opens, the drain timer |
| `Sources/akbun-terminal/Updater.swift` | release check, dmg download, bundle swap |
| `scripts/build-core.sh` | the Rust archive the package links |
| `scripts/bundle.sh` | assembles the .app and the dmg |

## What is not here yet

Agent state detection and the URL menu. Each has its own issue. When adding one, ask first whether it belongs in the core; the answer is yes unless it is pixels or keystrokes.
