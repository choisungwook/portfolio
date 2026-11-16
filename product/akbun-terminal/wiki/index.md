# akbun-terminal wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit and [development.md](./development.md) for how to build, test and release. [user-manual.md](./user-manual.md) is how a person uses it.

## What the app is

A core daemon that owns shells, with a macOS app and a terminal UI as its clients. In the macOS app the left sidebar holds projects and their workspace groups and colours each by what the agent inside it is doing, the middle runs the selected workspace's tabs — shells and files in one strip — and the right lists the project's files.

## Where the risk is

- **Three binaries, one protocol.** The daemon, the terminal UI and the macOS app are built separately and meet only on the socket. `BridgeTests` on the Swift side and `core/tests/daemon.rs` on the Rust side each start the real daemon; they are what fails when the two drift.
- **A daemon outlives what started it.** A shell lives until it exits, is closed, or the daemon is stopped; closing a client is none of those. The daemon exits by itself after ten seconds with no client and no shell, so an app that closes its own shells leaves nothing behind, and a terminal UI that quits leaves its shells running on purpose.
- **An updated client can meet an old daemon.** `CoreBridge.handshake` asks a daemon on another protocol to shut down and starts the one beside the app. That ends every shell the old daemon held.
- **Two clients, one tree.** A tree edit answers the caller with the whole tree and reaches every other connection as a `state` event. The macOS app does not read that event yet, so an edit made in the terminal UI shows there after a restart.
- **Wire names are the contract.** The Rust and Swift halves of the protocol are never compiled together. `responses_and_events_keep_their_wire_names` on one side and `ProtocolTests` on the other are what a rename has to trip over.
- **Events are drained, never pushed into a view.** A reader thread in `CoreConnection` queues what the daemon sends; the window asks on its run loop. Nothing touches a view off the main thread.
- **Bytes ride as JSON arrays.** Correct and several times larger than the payload. It cost the same when the core was in process, so the socket did not make it worse; it is still the first thing to move to its own channel.
- **The browser reads what is opened, and only that.** `read_directory` answers one level. The outline view asks for children inside `numberOfChildrenOfItem`, which is the moment a folder is opened, so nothing below a closed folder has been read. Hidden files and folders are listed and symlinks are leaves, both decided in the core.
- **The only document web view is Markdown Preview.** Bundled markdown-it, Highlight.js and Mermaid run in a non-persistent WebKit view. Raw document HTML is disabled, external navigation is intercepted, and HTML files are opened by the system browser instead of executed inside the app.
- **The menu bar is built from the core.** `shortcuts.rs` is the list of commands, their titles, their menu and their default keys; `AppDelegate` maps an id to a selector and nothing else. A key nobody changed is not in the state file, which is what lets a default move later.
- **The palette walks once, and the project search rides on it.** `search.rs` keeps the project's file list for a few seconds and scores a query with a dynamic program, not a greedy scan; greedy loses `src/app.rs` for the query `app`. Positions are character offsets, because a path can hold anything. `grep.rs` reuses that same cached list rather than walking again, and keeps no index of file contents: the shell in the middle of the window writes files constantly, so an index would be stale and a stale hit opens at the wrong line.
- **A document never supplies application code.** Markdown source is escaped into a text-only element and parsed with raw HTML disabled. Only scripts bundled by the app execute in Preview.
- **Every file opens, and it opens to be read.** One click on a file gives a tab; a folder still needs the triangle or a double click. Markdown is rendered, everything else is coloured, and Command E is what makes the tab editable. Nothing on screen can be typed into until somebody asks for it.
- **Syntax colour belongs to a grammar engine, not the core protocol.** HighlighterSwift wraps Highlight.js and returns an attributed string. The app supplies only a filename hint, a theme and the plain-text fallback above half a megabyte.
- **Git has two halves and the pane shows both.** The porcelain code's two columns are carried as a `Stage` beside the status. Green is staged, orange is the working tree, yellow is both, and the letter after the name is the change itself. Before this, `git add` changed nothing on screen.
- **The core owns the tree.** The shell supplies the app data directory and folder picker results. Rust validates, stores and returns the complete versioned project state after every mutation.
- **Judging reads a screen, not a stream.** `screen.rs` keeps an interpreted grid per session, updated on the reader thread. An agent paints over its own question within a second of it being answered, so a search over the raw bytes finds it forever. Only cursor movement and erasing are implemented; colour is dropped.
- **The phrases are data.** `agent.rs` reads one JSON file per agent from the app data directory and seeds it with the three shipped ones. A wording change in an agent's status line is a file edit, never a build.
- **Finished is a transition, and it belongs to a shell.** It is only reachable from working or asking, and `clear_status` is what ends it. That is what makes the same idle screen mean nothing at launch and mean "look at me" after a run. Judging is per session; the workspace takes the most blocked of its shells, with finished reported last so one tab going green never hides another still working. `clear_status` names the tab that was looked at, so its siblings keep their bells, and the controller remembers what each shell was last judged to be — the core resends every shell in a workspace whenever any one of them moves, so trusting that list alone would ring the same bell on every tick.
- **A split view owns its subviews' widths.** Panes are placed with `setPosition` and limited by the delegate. A width constraint is a second opinion about the same number, and whichever one loses is either a pane that opens at nothing or a divider that snaps back.
- **A thin divider is one point wide.** Nobody can aim at that, which is what made the panes look fixed. `splitView(_:effectiveRect:forDrawnRect:ofDividerAt:)` grows what answers the mouse without touching what is drawn.
- **A tree of subjects is half an answer.** Clicking a commit asks `git_show` for that commit alone, and the core splits the patch per file so the shell never parses a diff. The counts come from the same piece the lines do rather than from a second `--numstat` call, which is what keeps a row from disagreeing with what is under it. Only the pane that is on screen asks git anything.
- **The status pane reads and never writes.** Staged, not staged and the stash are three lists over one porcelain read plus `git stash list`. Staging from a pane beside a terminal would be a second way to do what the shell already does, and the two could disagree about what happened.
- **Git is asked, never inferred.** `git.rs` runs porcelain status and rolls it up the directory tree, so the colours in the file pane agree with the shell in the middle of the window. The paths are built from `--show-prefix` rather than `--show-toplevel`: a symlink above the project makes the resolved root a different string from the one the browser holds, and a status keyed by a path no row has never shows up. It runs on the run loop every three seconds, the same bet `detect` makes with `ps`; a repository big enough for `git status` to take a visible moment is what would make that wrong.
- **One palette, or the window looks broken.** A theme reaches every pane through `Palette`, mixed once from the theme's three colours in `Theme.swift`. A view reads colours and never asks which mode it is in; following the system is a palette like any other. Anything drawn by AppKit itself follows `window.appearance`, which is set alongside.
- **Ids are never reused.** `next_id` in the state file is a high water mark. Tabs, the agent colour and the finished notification are all keyed by workspace id, so a reused one shows a deleted workspace's state on a new row.
- **One keystroke is ours, the rest are the emulator's.** A terminal sends the same byte for return whether or not shift was held, so `TerminalKeys` turns shift and return into escape and return for the CLI agents that need a new line. It is a pure function in the core package for the same reason the URL rule is: the emulator behind the seam is expected to be replaced. Anything wider would be a second keyboard layout in front of SwiftTerm's. It is caught as a key equivalent because SwiftTerm's `keyDown` is public rather than open and cannot be overridden from this module.
- **The URL rule is not the emulator's.** SwiftTerm detects links itself and lives in the half that gets replaced. The view answers where a click landed; `url.rs` decides what may be opened, and only http and https ever are.
- **The emulator keeps the mouse.** `allowMouseReporting` is off, which is not SwiftTerm's default. With it on, a program that asks for the mouse — every agent CLI does — takes the drag that selects text and clears the selection on every linefeed, so there is no way to copy an error out of a running transcript. `View > Mouse Reporting` hands it back for the window and is deliberately not saved.
- **Debug green is not release green.** Swift 6.2.3's `CopyPropagation` pass crashes on some spellings that debug builds and `swift test` accept; `TerminalTabBarView.render` is written around one. Verification runs `scripts/bundle.sh`, not `swift build` alone.
- **The .app is not signed as a bundle.** `Bundle.module` for an executable target looks only at `Bundle.main.bundleURL`, which is the .app's root, so the SwiftPM resource bundles have to sit there — and codesign rejects anything beside `Contents` in the root. `bundle.sh` signs the executable before it copies it in. Signing it afterwards fails too: codesign walks up to the enclosing bundle.

## Files

| File | Role |
|---|---|
| `core/src/protocol.rs` | commands, responses, events, version check |
| `core/src/app.rs` | the only interpreter of commands, and the event queue |
| `core/src/daemon.rs` | the socket server, the judging timer, idle exit and signals |
| `core/src/hub.rs` | who hears what: connections, subscriptions, replay tails, per-connection status deltas |
| `core/src/client.rs` | the Rust client the terminal UI and the CLI use, and starting the daemon |
| `core/src/paths.rs` | data directory, socket, log and rules, the same answer for every client |
| `core/src/main.rs` | `akbun-terminal-core`: serve, stop, ls, run, send, read, wait, kill, skill |
| `core/src/SKILL.md` | the manual `skill` prints for agents |
| `tui/` | the terminal UI: pure state, pure render, key encoding, and a thin IO loop |
| `core/src/session.rs` | one shell under a pty, its reader thread and its reaping |
| `core/src/tree.rs` | project/workspace model, chosen theme, atomic JSON persistence |
| `core/src/browse.rs` | one directory level, and the link rule that keeps it out of cycles |
| `core/src/git.rs` | porcelain status, the stage beside it, the roll up that gives a folder a colour, one commit's patch and the stash |
| `core/src/theme.rs` | the known colour schemes as a hex table, dark and light |
| `core/src/shortcuts.rs` | the menu commands, their default keys and the rule about clashes |
| `core/src/search.rs` | the project file index and the score that ranks a query's matches |
| `core/src/grep.rs` | Command shift F: the lines under the project holding a query, over that same file list |
| `core/src/screen.rs` | the interpreted screen the judging reads |
| `core/src/agent.rs` | rule files, the process tree walk, and the judgement |
| `core/rules/*.json` | the agent rules this build ships and seeds |
| `core/src/url.rs` | what counts as a URL, and what may be opened |
| `desktop/Sources/AkbunTerminalCore/Protocol.swift` | the Swift half of the protocol |
| `desktop/Sources/AkbunTerminalCore/CoreBridge.swift` | one request at a time to the daemon, and the handshake that replaces a stale one |
| `desktop/Sources/AkbunTerminalCore/CoreConnection.swift` | the socket, the reader thread, and launching the daemon detached |
| `desktop/Sources/AkbunTerminalCore/Release.swift` | version arithmetic and dmg naming, pure |
| `desktop/Sources/AkbunTerminalCore/UpdateScript.swift` | the bundle swap script, testable as text |
| `desktop/Sources/akbun-terminal/TerminalRendering.swift` | the seam a real terminal engine plugs into |
| `desktop/Sources/akbun-terminal/SwiftTermTerminalView.swift` | the emulator behind that seam |
| `desktop/Sources/akbun-terminal/TerminalTabBarView.swift` | the tab strip for the selected workspace |
| `desktop/Sources/AkbunTerminalCore/TerminalTabs.swift` | which shell and which document belong to which workspace, and which is on screen |
| `desktop/Sources/AkbunTerminalCore/Zoom.swift` | bounded size scaling, independently used by content and panels |
| `desktop/Sources/AkbunTerminalCore/TerminalKeys.swift` | the keystrokes this app encodes itself, shift and return so far |
| `desktop/Sources/AkbunTerminalCore/DocumentLink.swift` | where a link in a document points: a tab, a browser, or nowhere |
| `desktop/Sources/AkbunTerminalCore/ShortcutKey.swift` | a core shortcut string to a key equivalent and a modifier mask, and back |
| `desktop/Sources/AkbunTerminalCore/DocumentSearch.swift` | Command F over the file on screen: the matches and which one is next |
| `desktop/Sources/AkbunTerminalCore/MarkdownPage.swift` | the sandboxed Markdown page, its CSP and source escaping |
| `desktop/Sources/akbun-terminal/ProjectSidebarView.swift` | project/workspace two-level tree and status presentation |
| `desktop/Sources/akbun-terminal/FileBrowserView.swift` | the outline view that reads a folder when it is opened, and the four panes over one project |
| `desktop/Sources/akbun-terminal/GitCommitDetailView.swift` | what the clicked commit changed: its files and one diff |
| `desktop/Sources/akbun-terminal/GitStatusPanelView.swift` | staged, not staged and the stash, read only |
| `desktop/Sources/AkbunTerminalCore/GitDiff.swift` | a unified diff as drawable lines with the numbers down the side |
| `desktop/Sources/akbun-terminal/DocumentView.swift` | one file tab, its read and edit modes, save, the unsaved question and the command click on a link |
| `desktop/Sources/akbun-terminal/MarkdownPreviewView.swift` | bundled renderer loading, WebKit navigation policy and preview search |
| `desktop/Sources/akbun-terminal/CommandPaletteView.swift` | the Command O sheet: the list, the keyboard and the marks |
| `desktop/Sources/akbun-terminal/SearchPanelView.swift` | the Command shift F pane: the field, the debounce and the marked result lines |
| `desktop/Sources/akbun-terminal/ShortcutsWindowController.swift` | Settings › Shortcuts, and the recording monitor |
| `desktop/Sources/akbun-terminal/CodeHighlighter.swift` | HighlighterSwift adapter, language hint and plain-text fallback |
| `desktop/Sources/AkbunTerminalCore/Theme.swift` | hex to bytes, the only part of a theme that can be wrong |
| `desktop/Sources/akbun-terminal/TerminalWindowController.swift` | one window, the tabs it opens, the drain timer |
| `desktop/Sources/akbun-terminal/Palette.swift` | every colour the window draws with, and what a git status and its stage look like |
| `desktop/Sources/akbun-terminal/Browsers.swift` | the installed browsers, asked of the system once |
| `desktop/Sources/akbun-terminal/Updater.swift` | release check, dmg download, bundle swap |
| `desktop/scripts/build-core.sh` | the daemon and the terminal UI, release build |
| `desktop/scripts/bundle.sh` | assembles the .app with the daemon inside, the dmg and the cli archive |

## What is not here yet

Windows, a desktop app for Linux, a second window, and search in the scrollback. The macOS app does not yet reattach to shells left running, follow `state` events, or show the agents list the terminal UI has. Command F searches the file in the tab and Command shift F the files under the project; neither reads the terminal beside them. Domain state belongs in the core; rendering engines and keystrokes belong in a client.
