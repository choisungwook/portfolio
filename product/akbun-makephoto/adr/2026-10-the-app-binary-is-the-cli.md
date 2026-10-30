# The app binary is the CLI

## Decision

`main.rs` checks the first argument. If it is a known subcommand (`list`, `edit`, `--help` and so on) it runs the CLI and exits; anything else opens the window. Users link `Contents/MacOS/akbun-makephoto` to `makephoto` on their PATH. The `makephoto-cli` crate also builds a standalone `makephoto` binary for development.

## Reason

A separate binary would have to ship inside the bundle as a Tauri sidecar, with a per-target file name and a second build step, and could fall out of step with the app version. The app binary already contains the core, so the CLI costs a few hundred kilobytes of clap.

Matching only known words matters. macOS and launch tools can pass arguments to a GUI launch, and treating an unknown one as a CLI call would make the window fail to open.
