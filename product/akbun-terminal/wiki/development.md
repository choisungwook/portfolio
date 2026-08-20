# Development

## Prerequisites

- macOS 14 or newer, Xcode command line tools for `swift`.
- A Rust toolchain. `rustup` default stable is enough; no target needs adding.

## Build and run

```bash
cd workspace
./scripts/build-core.sh          # produces core/target/release/libakbun_terminal_ffi.a
swift build                      # links against it
swift run akbun-terminal         # runs unbundled, update install is disabled here
```

`scripts/bundle.sh` does both steps and wraps the result in an .app with a dmg beside it. Run the app from the bundle when testing anything that reads the version or the update path, because an unbundled binary has no Info.plist to read a version from.

The link path in `Package.swift` is relative, so `swift build` has to run from the package root. Both scripts `cd` there first; a build started elsewhere fails at the link step with a missing `-lakbun_terminal_ffi`.

The core is always built in release, even for tests. One profile keeps one link path in the package file.

## Test

```bash
cd workspace
cargo test --manifest-path core/Cargo.toml   # protocol, pty round trip, session lifetime
./scripts/build-core.sh && swift test        # protocol shape, the bridge, update helpers
```

The core tests need no macOS and no AppKit, which is why CI runs them on the cheap runner. The Swift tests need the archive first; `swift test` without it fails to link.

`BridgeTests` starts a real shell. It is the test that fails when the header and the Rust surface drift apart, so do not skip it when changing either. One of its cases runs the whole detection path through the boundary: a rule file, a real pty, and a status back.

SwiftPM does not know the static archive is an input, so rebuilding the core is not enough to make `swift test` use it. The symptom is a Rust change that has clearly compiled and a Swift test still reporting the old behaviour, usually as an unknown command variant. Delete the test bundle to force the relink.

```bash
rm -rf .build/arm64-apple-macosx/debug/akbun-terminalPackageTests.xctest
```

## Adding a language to the highlighter

`core/crates/core/src/highlight.rs` holds one lexer and a table. A new language is a row in `LANGUAGES`: its name, its suffixes, and only the fields that differ from `plain_language`.

```rust
Language {
    line_comments: &["#"],
    quotes: C_STRINGS,
    keywords: &["def", "end"],
    ..plain_language("Elixir", &["ex", "exs"])
},
```

Nothing on the Swift side changes. The shell only turns a token kind into a colour, and the kinds are fixed.

Two rules are worth knowing before adding a row. A quote that may not cross a line stops at the end of it, which is what keeps an apostrophe in prose from swallowing the file; set `multiline` only for the delimiters that really do span lines. And a language whose meaning depends on nesting will be coloured approximately, because there is no grammar here to nest with.

## Caveats

- SwiftTerm is fetched by SwiftPM, so the first build and the CI jobs need network. `Package.resolved` is what pins it.
- `TERM` is set by the core, not by the user's profile. A GUI process inherits none, and without it `clear` fails and escape codes land on screen as text.
- Output bytes cross as JSON arrays, several times their own size. Fine for one session; the protocol version is there for when it is not.
- The header is not generated. Change `core/crates/ffi/src/lib.rs` and the header together, in the same commit.

## Release

Bump `workspace/VERSION` in the same commit as any change under `workspace/`. Patch for a fix, minor for a feature. Forgetting it makes the release job fail at `Create tag` with "tag already exists", and that failure does not show on the pull request.

`.github/workflows/release-akbun-terminal.yml` runs three jobs.

| Trigger | Job | Runner | Does |
|---|---|---|---|
| pull request | `core` | ubuntu | `cargo test` |
| pull request | `shell` | macOS | build the archive, `swift test` |
| master push | `release` | macOS | both test runs, dmg, tag, release |

Order matters: build first, then tag, then release. A failed build must not leave a tag behind. After merging, check that the release actually appeared; a green pull request says nothing about it.

The build is unsigned, so a downloaded copy needs the quarantine attribute cleared. The release notes say so, and they are the only place a user will look.

```bash
xattr -cr /Applications/akbun-terminal.app
```
