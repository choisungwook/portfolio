# akbun-terminal wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit and [development.md](./development.md) for how to build, test and release.

## What the app is

A macOS app that wraps shells. The left sidebar holds projects and their workspace groups and colours each by what the agent inside it is doing, the middle runs the selected workspace's tabs — shells and files in one strip — and the right lists the project's files.

## Where the risk is

- **The link step, not the code.** This is the only product here that compiles two languages into one binary. `swift build` cannot produce the Rust archive, so `scripts/build-core.sh` runs first and `Package.swift` links `core/target/release` by a fixed relative path. Building from another directory breaks the link, which is why both scripts `cd` to the package root.
- **The header is written by hand.** `Sources/CAkbunTerminalCore/include/akbun_terminal.h` mirrors `core/crates/ffi/src/lib.rs`. Nothing checks them at compile time; `BridgeTests` is what fails when they drift.
- **Wire names are the contract.** The Rust and Swift halves of the protocol are never compiled together. `responses_and_events_keep_their_wire_names` on one side and `ProtocolTests` on the other are what a rename has to trip over.
- **One ownership rule.** Every string the core returns was allocated by Rust and goes back to `akbun_core_string_free`. `CoreBridge` is the only file allowed to hold that pointer, so the rule lives in one place.
- **Events are drained, never pushed.** The core queues; the shell asks on its run loop. Nothing calls back from a reader thread, so no view is ever touched off the main thread.
- **Bytes ride as JSON arrays.** Correct and several times larger than the payload. Acceptable while one session is being proved out, and the first thing to move to its own channel; the protocol version exists for exactly that.
- **The browser reads what is opened, and only that.** `read_directory` answers one level. The outline view asks for children inside `numberOfChildrenOfItem`, which is the moment a folder is opened, so nothing below a closed folder has been read. Hidden files and folders are listed and symlinks are leaves, both decided in the core.
- **A web view exists, for two things.** A mermaid fence is drawn by the bundled mermaid in a web view that is never on screen and photographed into the text flow; an HTML file has a Render mode with scripting off. Both are narrow on purpose, and everything else about a document is unchanged. `MermaidPage` holds the escaping and the policy, in the core package, because that rule is the whole reason this is safe.
- **The menu bar is built from the core.** `shortcuts.rs` is the list of commands, their titles, their menu and their default keys; `AppDelegate` maps an id to a selector and nothing else. A key nobody changed is not in the state file, which is what lets a default move later.
- **The palette walks once.** `search.rs` keeps the project's file list for a few seconds and scores a query with a dynamic program, not a greedy scan; greedy loses `src/app.rs` for the query `app`. Positions are character offsets, because a path can hold anything.
- **A document is data, never markup.** Markdown arrives as blocks and is drawn as an attributed string. Raw HTML is dropped in the core and links are not clickable, so opening a file someone else wrote cannot reach anything.
- **Every file opens, and it opens to be read.** One click on a file gives a tab; a folder still needs the triangle or a double click. Markdown is rendered, everything else is coloured, and Command E is what makes the tab editable. Nothing on screen can be typed into until somebody asks for it.
- **Colour is a table, not a grammar.** `highlight.rs` is one lexer with a row per language. It cannot see nesting, which is why a regular expression body or a nested template literal is coloured approximately. Above half a megabyte a file is answered as plain lines, because tokenizing runs on the run loop that draws.
- **Git has two halves and the pane shows both.** The porcelain code's two columns are carried as a `Stage` beside the status. Green is staged, orange is the working tree, yellow is both, and the letter after the name is the change itself. Before this, `git add` changed nothing on screen.
- **The core owns the tree.** The shell supplies the app data directory and folder picker results. Rust validates, stores and returns the complete versioned project state after every mutation.
- **Judging reads a screen, not a stream.** `screen.rs` keeps an interpreted grid per session, updated on the reader thread. An agent paints over its own question within a second of it being answered, so a search over the raw bytes finds it forever. Only cursor movement and erasing are implemented; colour is dropped.
- **The phrases are data.** `agent.rs` reads one JSON file per agent from the app data directory and seeds it with the three shipped ones. A wording change in an agent's status line is a file edit, never a build.
- **Finished is a transition.** It is only reachable from working or asking, and `clear_status` is what ends it. That is what makes the same idle screen mean nothing at launch and mean "look at me" after a run, and what fires the notification exactly once.
- **A split view owns its subviews' widths.** Panes are placed with `setPosition` and limited by the delegate. A width constraint is a second opinion about the same number, and whichever one loses is either a pane that opens at nothing or a divider that snaps back.
- **A thin divider is one point wide.** Nobody can aim at that, which is what made the panes look fixed. `splitView(_:effectiveRect:forDrawnRect:ofDividerAt:)` grows what answers the mouse without touching what is drawn.
- **Git is asked, never inferred.** `git.rs` runs porcelain status and rolls it up the directory tree, so the colours in the file pane agree with the shell in the middle of the window. The paths are built from `--show-prefix` rather than `--show-toplevel`: a symlink above the project makes the resolved root a different string from the one the browser holds, and a status keyed by a path no row has never shows up. It runs on the run loop every three seconds, the same bet `detect` makes with `ps`; a repository big enough for `git status` to take a visible moment is what would make that wrong.
- **One palette, or the window looks broken.** A theme reaches every pane through `Palette`, mixed once from the theme's three colours in `Theme.swift`. A view reads colours and never asks which mode it is in; following the system is a palette like any other. Anything drawn by AppKit itself follows `window.appearance`, which is set alongside.
- **Ids are never reused.** `next_id` in the state file is a high water mark. Tabs, the agent colour and the finished notification are all keyed by workspace id, so a reused one shows a deleted workspace's state on a new row.
- **One keystroke is ours, the rest are the emulator's.** A terminal sends the same byte for return whether or not shift was held, so `TerminalKeys` turns shift and return into escape and return for the CLI agents that need a new line. It is a pure function in the core package for the same reason the URL rule is: the emulator behind the seam is expected to be replaced. Anything wider would be a second keyboard layout in front of SwiftTerm's. It is caught as a key equivalent because SwiftTerm's `keyDown` is public rather than open and cannot be overridden from this module.
- **The URL rule is not the emulator's.** SwiftTerm detects links itself and lives in the half that gets replaced. The view answers where a click landed; `url.rs` decides what may be opened, and only http and https ever are.

## Files

| File | Role |
|---|---|
| `core/crates/core/src/protocol.rs` | commands, responses, events, version check |
| `core/crates/core/src/app.rs` | the only interpreter of commands, and the event queue |
| `core/crates/core/src/session.rs` | one shell under a pty, its reader thread and its reaping |
| `core/crates/core/src/tree.rs` | project/workspace model, chosen theme, atomic JSON persistence |
| `core/crates/core/src/browse.rs` | one directory level, and the link rule that keeps it out of cycles |
| `core/crates/core/src/git.rs` | porcelain status, the stage beside it, and the roll up that gives a folder a colour |
| `core/crates/core/src/markdown.rs` | markdown to blocks, and the place raw HTML is dropped |
| `core/crates/core/src/highlight.rs` | the language table, the lexer, and the size limit that keeps it off the run loop |
| `core/crates/core/src/theme.rs` | the known colour schemes as a hex table, dark and light |
| `core/crates/core/src/shortcuts.rs` | the menu commands, their default keys and the rule about clashes |
| `core/crates/core/src/search.rs` | the project file index and the score that ranks a query's matches |
| `core/crates/core/src/screen.rs` | the interpreted screen the judging reads |
| `core/crates/core/src/agent.rs` | rule files, the process tree walk, and the judgement |
| `core/crates/core/rules/*.json` | the agent rules this build ships and seeds |
| `core/crates/core/src/url.rs` | what counts as a URL, and what may be opened |
| `core/crates/ffi/src/lib.rs` | the five function C surface |
| `Sources/CAkbunTerminalCore/include/akbun_terminal.h` | the header that mirrors it |
| `Sources/AkbunTerminalCore/Protocol.swift` | the Swift half of the protocol |
| `Sources/AkbunTerminalCore/CoreBridge.swift` | the only file that touches pointers |
| `Sources/AkbunTerminalCore/Release.swift` | version arithmetic and dmg naming, pure |
| `Sources/AkbunTerminalCore/UpdateScript.swift` | the bundle swap script, testable as text |
| `Sources/akbun-terminal/TerminalRendering.swift` | the seam a real terminal engine plugs into |
| `Sources/akbun-terminal/SwiftTermTerminalView.swift` | the emulator behind that seam |
| `Sources/akbun-terminal/TerminalTabBarView.swift` | the tab strip for the selected workspace |
| `Sources/AkbunTerminalCore/TerminalTabs.swift` | which shell and which document belong to which workspace, and which is on screen |
| `Sources/AkbunTerminalCore/Zoom.swift` | the one size the whole window is drawn at |
| `Sources/AkbunTerminalCore/TerminalKeys.swift` | the keystrokes this app encodes itself, shift and return so far |
| `Sources/AkbunTerminalCore/DocumentLink.swift` | where a link in a document points: a tab, a browser, or nowhere |
| `Sources/AkbunTerminalCore/ShortcutKey.swift` | a core shortcut string to a key equivalent and a modifier mask, and back |
| `Sources/AkbunTerminalCore/DocumentSearch.swift` | Command F over the file on screen: the matches and which one is next |
| `Sources/AkbunTerminalCore/MermaidPage.swift` | the page a diagram is drawn in, its policy and its escaping |
| `Sources/akbun-terminal/ProjectSidebarView.swift` | project/workspace two-level tree and status presentation |
| `Sources/akbun-terminal/FileBrowserView.swift` | the outline view that reads a folder when it is opened |
| `Sources/akbun-terminal/DocumentView.swift` | one file tab, its read and edit modes, save, the unsaved question and the command click on a link |
| `Sources/akbun-terminal/MarkdownAttributedText.swift` | blocks to one attributed string, diagrams included |
| `Sources/akbun-terminal/MermaidRenderer.swift` | the offscreen web view a diagram is drawn and photographed in |
| `Sources/akbun-terminal/CommandPaletteView.swift` | the Command O sheet: the list, the keyboard and the marks |
| `Sources/akbun-terminal/ShortcutsWindowController.swift` | Settings › Shortcuts, and the recording monitor |
| `Sources/akbun-terminal/CodeAttributedText.swift` | coloured tokens to one attributed string, and what each kind looks like |
| `Sources/AkbunTerminalCore/Theme.swift` | hex to bytes, the only part of a theme that can be wrong |
| `Sources/akbun-terminal/TerminalWindowController.swift` | one window, the tabs it opens, the drain timer |
| `Sources/akbun-terminal/Palette.swift` | every colour the window draws with, and what a git status and its stage look like |
| `Sources/akbun-terminal/Browsers.swift` | the installed browsers, asked of the system once |
| `Sources/akbun-terminal/Updater.swift` | release check, dmg download, bundle swap |
| `scripts/build-core.sh` | the Rust archive the package links |
| `scripts/bundle.sh` | assembles the .app and the dmg |

## What is not here yet

Windows and Linux, a second window, and search in the scrollback. Command F searches the file in the tab, never the terminal beside it. When adding anything, ask first whether it belongs in the core; the answer is yes unless it is pixels or keystrokes.
