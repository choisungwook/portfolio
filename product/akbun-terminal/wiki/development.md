# Development

## Prerequisites

- A Rust toolchain. `rustup` default stable is enough; no target needs adding. This is all the core and the terminal UI need, on macOS or Linux.
- For the desktop app: macOS 14 or newer and the Xcode command line tools for `swift`.

## Build and run

```bash
cd workspace
cargo build --release            # target/release/akbun-terminal-core and akbun-terminal-tui
./target/release/akbun-terminal-tui

cd desktop
swift build
AKBUN_TERMINAL_CORE=../target/release/akbun-terminal-core swift run akbun-terminal   # unbundled, update install is disabled here
```

An unbundled app has no daemon beside it, which is what `AKBUN_TERMINAL_CORE` is for. `desktop/scripts/bundle.sh` builds everything, puts the daemon in the .app next to the executable, and leaves a dmg and a cli archive in `desktop/build/`. Run the app from the bundle when testing anything that reads the version or the update path, because an unbundled binary has no Info.plist to read a version from.

To try something without touching the shells you have open, point a client at its own daemon:

```bash
export AKBUN_TERMINAL_HOME=$(mktemp -d)   # its own data directory and socket
./target/release/akbun-terminal-tui
./target/release/akbun-terminal-core stop
```

## Test

```bash
cd workspace
cargo test --workspace                                   # protocol, pty round trip, the daemon end to end, the tui's state and rendering
./desktop/scripts/build-core.sh && (cd desktop && swift test)   # protocol shape, the bridge against a real daemon, update helpers
./desktop/scripts/bundle.sh                              # the release build, which the two above do not cover
```

The third line is not optional after a Swift change. `swift build` and `swift test` compile without the optimiser, and Swift 6.2.3's `CopyPropagation` pass crashes on spellings both of them accept — see [the note on it](../knowledge/decisions/2026-09-release-build-crashes-on-some-swift-spellings.md). The release job builds the same way `bundle.sh` does, so a crash found here is a crash that would otherwise be found after merging.

The core and tui tests need no macOS and no AppKit, which is why CI runs them on the cheap runner. `core/tests/daemon.rs` starts the real binary on a socket in a temp directory; no test uses the real data directory.

`BridgeTests` starts its own daemon per test from `workspace/target/release/akbun-terminal-core`, so the daemon has to be built first, and a Rust change needs a rebuild before `swift test` sees it. It is the test that fails when the Swift and Rust halves of the protocol drift apart. One of its cases runs the whole detection path through the socket: a rule file, a real pty, and a status back.

The terminal UI can be driven without a person, which is how a change to it is checked:

```bash
tmux new-session -d -s t -x 160 -y 45 ./target/release/akbun-terminal-tui
tmux send-keys -t t 'echo hello' Enter
tmux capture-pane -t t -p
```

## Syntax highlighting

Highlight.js owns language grammars. Do not add language lexers to the Rust core. `CodeHighlighter.swift` only maps filenames or suffix aliases that Highlight.js cannot infer directly; unknown files remain plain text.

Markdown renderer scripts live under `desktop/Sources/akbun-terminal/Resources` and are copied by SwiftPM. Pin their versions in `THIRD_PARTY_NOTICES.md`; never load them from a CDN at runtime.

## Caveats

- SwiftTerm is fetched by SwiftPM, so the first build and the CI jobs need network. `Package.resolved` is what pins it.
- `TERM` is set by the core, not by the user's profile. A GUI process inherits none, and without it `clear` fails and escape codes land on screen as text.
- Output bytes cross as JSON arrays, several times their own size. Fine for one session; the protocol version is there for when it is not.
- The two halves of the protocol are written by hand, `core/src/protocol.rs` and `desktop/Sources/AkbunTerminalCore/Protocol.swift`. Change them together, in the same commit.
- A daemon keeps running the binary it was started from. After rebuilding the core, `akbun-terminal-core stop` before trying the new one.

## Release

Bump `workspace/VERSION` in the same commit as any change under `workspace/`. Patch for a fix, minor for a feature. Forgetting it makes the release job fail at `Create tag` with "tag already exists", and that failure does not show on the pull request.

`.github/workflows/release-akbun-terminal.yml` runs three jobs.

| Trigger | Job | Runner | Does |
|---|---|---|---|
| pull request | `core` | ubuntu | `cargo test --workspace` |
| pull request | `desktop` | macOS | build the daemon, `swift test` |
| master push | `release` | macOS | both test runs, dmg and cli archive, tag, release |

Order matters: build first, then tag, then release. A failed build must not leave a tag behind. After merging, check that the release actually appeared; a green pull request says nothing about it.

`bundle.sh` signs the executable before copying it into the .app and never signs the .app itself. That is forced rather than chosen: the SwiftPM resource bundles have to sit in the bundle root for `Bundle.module` to find them, and codesign rejects a bundle root holding anything but `Contents`. The [note on it](../knowledge/decisions/2026-09-app-bundle-is-signed-at-the-executable.md) has what was tried.

The build is unsigned, so a downloaded copy needs the quarantine attribute cleared. The release notes say so, and they are the only place a user will look.

```bash
xattr -cr /Applications/akbun-terminal.app
```
