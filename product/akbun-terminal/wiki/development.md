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

`BridgeTests` starts a real shell. It is the test that fails when the header and the Rust surface drift apart, so do not skip it when changing either.

## Caveats

- The terminal view is not an emulator. Escape sequences are drawn as text, so `vim` or a progress bar looks wrong. That is this build's known limit, not a bug to file.
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
