# akbun-terminal

A macOS window that wraps a shell. It restores a project and workspace tree on the left, terminal tabs in the middle and that project's files on the right, and colours each workspace with what the CLI agent inside it is doing.

## Directory

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Rust core, Swift shell, tests, build scripts |
| [wiki/](./wiki/) | Architecture and development notes |
| [adr/](./adr/) | Decision records |

## How it is put together

Two halves, split by how long each is expected to live.

| Half | Holds | Language |
|---|---|---|
| core | protocol, sessions, pty, everything that must survive a rewrite of the screen | Rust |
| shell | window, views, menus, keyboard | Swift and AppKit |

They meet at one JSON protocol carrying a version number. Today it travels through five C functions inside one process; the same types can travel over a socket later without the core learning anything new. The shell is expected to be replaced at least once, so it holds no state and no rules.

The terminal view sits behind a small protocol of its own. SwiftTerm fills it, so escape sequences are interpreted rather than printed. Swapping in another engine is a new file, not a new design.

## Quick start

Build and run from source:

```bash
cd workspace && ./scripts/bundle.sh && open build/akbun-terminal.app
```

Run the tests. The core needs no macOS, which is why its tests are the fast ones:

```bash
cd workspace
cargo test --manifest-path core/Cargo.toml
./scripts/build-core.sh && swift test
```

## What this build does

- Adds folder-backed or empty projects and workspace children in a two-level sidebar.
- Restores the project tree from a versioned JSON file in the app data directory.
- Opens a terminal tab strip for the selected workspace, with add, switch and close.
- Runs each tab as the user's login shell in the project folder, with colour, the cursor and full screen programs drawn properly.
- Sends keystrokes to it, draws what comes back, and tells it the new size when the window changes.
- Ends every shell when the window closes or the app quits, and reaps it, so nothing lingers.
- Lists the selected project's files on the right, hidden files and folders included, reading a folder when it is opened, with Reveal in Finder, Copy Path and a refresh.
- Colours those names by what git makes of them when the project is a repository, with a closed folder wearing the strongest status of anything inside it, refreshed while the shell beside it works.
- Opens a markdown file in a tab beside the shells, rendered or as source, and writes it back on save.
- Opens a markdown link inside a rendered document in its own tab on Command click, and sends an http or https link to a browser.
- Wears a known colour scheme picked from the View menu, or follows the system appearance, and dresses every pane in it rather than the terminal alone.
- Renames and deletes a project or a workspace from the sidebar, ending the shells under it and leaving the folder on disk alone.
- Zooms the whole window with Command plus and minus, and back to the default size with Command zero: the terminal, the tab strip, the project tree, the file list and the rendered document all follow one size.
- Lets the sidebar and the file pane be dragged to any width, and folded away entirely.
- Colours a workspace by what the agent in it is doing: orange while it works, red when it is waiting for an answer, green when it has finished and nobody has looked. Opening the workspace takes the green away.
- Raises a notification when a workspace finishes, and opens that workspace when the notification is clicked.
- Reads those judgements from one JSON file per agent under the app data directory, so a new agent is a new file rather than a new build.
- Offers to copy or open a URL clicked in the terminal, in the system browser or a named one, and refuses anything that is not http or https.
- Checks for updates from the application menu and replaces the installed bundle in place.
