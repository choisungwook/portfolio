# akbun-terminal

A terminal workspace for running CLI agents. A core daemon owns the shells, the project tree and what each agent is doing; a macOS app and a terminal UI are two windows onto it. Shells keep running when a window closes, and agents inside them can start, message, read and wait for one another through the core.

## Directory

| Directory | Description |
|---|---|
| [workspace/core/](./workspace/core/) | Rust daemon and its CLI, `akbun-terminal-core` |
| [workspace/tui/](./workspace/tui/) | Terminal UI client, `akbun-terminal-tui` |
| [workspace/desktop/](./workspace/desktop/) | macOS app: Swift, AppKit, build scripts |
| [wiki/](./wiki/) | Architecture and development notes |
| [adr/](./adr/) | Decision records made before `knowledge/` |
| [knowledge/](./knowledge/) | Decisions since |

## How it is put together

Three parts, split by who owns what.

| Part | Holds | Language |
|---|---|---|
| core | shells and their ptys, the project tree, agent status, the protocol. Draws nothing | Rust |
| tui | sidebar, tabs and a terminal inside any terminal | Rust, ratatui |
| desktop | window, views, menus, files, Git and documents | Swift and AppKit |

Both clients speak one versioned JSON protocol to the core over a Unix socket, one document per line. A client starts the core when none is running, and the core exits by itself once it has had no client and no shell for ten seconds.

## Quick start

Terminal UI, on macOS or Linux:

```bash
cd workspace && cargo build --release
./target/release/akbun-terminal-tui
```

`Ctrl+G` then `?` lists the keys. `Ctrl+G` then `q` leaves; the shells stay, and the next start shows them again.

macOS app, built from source:

```bash
cd workspace/desktop && ./scripts/bundle.sh && open build/akbun-terminal.app
```

Run the tests. The core and the tui need no macOS, which is why their tests are the fast ones:

```bash
cd workspace
cargo test --workspace
./desktop/scripts/build-core.sh && (cd desktop && swift test)
```

## Agents talking to agents

A shell started by the core knows its own id as `AKBUN_TERMINAL_SESSION`, so an agent in it can delegate and hear back without a person in between.

```bash
akbun-terminal-core run --name review -- claude     # start a shell running a program, print its id
akbun-terminal-core send review "Review src/x.rs"   # type a message into it and press return
akbun-terminal-core wait review                     # until it stops working, instead of sleeping
akbun-terminal-core read review                     # what is on its screen
akbun-terminal-core ls                              # every shell: id, name, parent, agent, status
akbun-terminal-core skill                           # the manual an agent reads
```

A message sent from inside a shell arrives wrapped as `<akbun from="3 lead">…</akbun>`, which tells the receiver whom to answer. The terminal UI lists every shell with an agent in it, across workspaces, in its Agents view.

## What the macOS app does

- Adds folder-backed or empty projects and workspace children in a two-level sidebar.
- Restores the project tree from a versioned JSON file in the app data directory.
- Opens a terminal tab strip for the selected workspace, with add, switch and close.
- Runs each tab as the user's login shell in the project folder, with colour, the cursor and full screen programs drawn properly.
- Sends keystrokes to it, draws what comes back, and tells it the new size when the window changes.
- Sends escape and return for shift with return, so a CLI agent in a tab takes a new line instead of the prompt.
- Ends every shell when the window closes or the app quits, and reaps it, so nothing lingers.
- Lists the selected project's files on the right, hidden files and folders included, reading a folder when it is opened, with Reveal in Finder, Copy Path and a refresh.
- Colours those names by what git makes of them when the project is a repository, with a closed folder wearing the strongest status of anything inside it, refreshed while the shell beside it works.
- Tells a staged change from one that is only in the working tree: green for staged, orange for not, yellow for both, and a letter after the name for what the change was.
- Switches the right pane from files to a SourceTree-style graph of the latest 200 commits across branches, remotes and tags, with refs, author, time and hash.
- Opens any file in a tab beside the shells on one click and writes it back on save.
- Delegates source highlighting to HighlighterSwift and Highlight.js instead of maintaining one lexer per language.
- Turns the tab between icon-only View and Edit modes with Command E, using the selected theme's accent for the active icon.
- Previews Markdown with bundled markdown-it, Highlight.js and Mermaid. Raw document HTML and document scripts are disabled.
- Opens a saved HTML file in the system browser through an independent `Open in Browser` action, with an explicit choice when the buffer is dirty.
- Finds text in the file on screen with Command F, marking every match and stepping through them with Command G.
- Finds text anywhere under the project with Command shift F, listing the line and where in it the match fell in the right pane, and opening the file at that line on a click.
- Opens any file in the project by typing part of its path with Command O, best match first and the typed characters marked.
- Uses Highlight.js language definitions and shows a file it does not recognise as plain text rather than refusing it.
- Opens a relative link inside a rendered document in its own tab on click, and sends an http or https link to a browser.
- Wears a known colour scheme picked from Settings, or follows the system appearance, and dresses every pane in it rather than the terminal alone. Workspace names in the sidebar are drawn larger in the complement of the theme's blue, adjusted until they read on the panel. A dozen dark schemes and seven light ones, one of which is called Light.
- Puts any menu command on any keystroke from Settings, refusing a key another command already has, and remembers only what was changed.
- Renames and deletes a project or a workspace from the sidebar, ending the shells under it and leaving the folder on disk alone.
- Renames a shell tab from a right click on it, so a strip of three shells can say which one is the build and which one is the agent. A document tab keeps its file name.
- Zooms the whole window with Command plus and minus, and back to the default size with Command zero: the terminal, the tab strip, the project tree, the file list and the rendered document all follow one size.
- Lets the sidebar and the file pane be dragged to any width, and folded away entirely, from a button on each side of the title bar or with Command shift B and Command B.
- Colours a workspace by what the agent in it is doing: orange while it works, red when it is waiting for an answer, green when it has finished and nobody has looked. Opening that tab takes the green away.
- Judges each shell on its own and marks its tab: a turning ring while it works, a bell once it has finished, a warning while it waits. The workspace takes the most blocked of them, so one tab finishing never hides another still working.
- Raises a notification naming the tab that finished, once per tab, and opens that workspace when it is clicked.
- Reads those judgements from one JSON file per agent under the app data directory, so a new agent is a new file rather than a new build.
- Keeps the mouse rather than handing it to the program, so a drag selects text for copying even while an agent CLI is running. `View > Mouse Reporting` hands it back.
- Offers to copy or open a URL clicked in the terminal, in the system browser or a named one, and refuses anything that is not http or https.
- Checks for updates from the application menu and replaces the installed bundle in place.
