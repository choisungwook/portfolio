# akbun-terminal

A macOS window that wraps a shell. It restores a project and workspace tree beside the terminal; terminal tabs, agent state detection, a file browser and a markdown viewer are the destination.

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

The terminal view sits behind a small protocol of its own. This build draws with a plain text view, which is enough to prove the shell talks to the core and not enough to run a full screen program. Replacing it with a real engine is a new file, not a new design.

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

- Opens one window with one shell running in the user's login shell and home directory.
- Adds folder-backed or empty projects and workspace children in a two-level sidebar.
- Restores the project tree from a versioned JSON file in the app data directory.
- Sends keystrokes to it, draws what comes back, and tells it the new size when the window changes.
- Ends the shell when the window closes or the app quits, and reaps it, so nothing lingers.
- Checks for updates from the application menu and replaces the installed bundle in place.
