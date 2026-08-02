# Development

## Build and run

Needs Rust and Node. macOS is the platform the release builds for.

```bash
cd workspace
npm install
npm start        # tauri dev
npm run dist     # a dmg in src-tauri/target/release/bundle
```

ffmpeg is a runtime dependency, not a build one:

```bash
brew install ffmpeg
```

## Tests

Both suites run without an app binary, and both run without ffmpeg installed.

```bash
npm test          # node --test over the timeline model
npm run test:rust # cargo test -p makevideo-render
```

`-p makevideo-render` is not decoration. The render crate depends on neither tauri nor a webview, so this compiles serde and nothing else. Dropping the `-p` pulls in the app crate, which on a Linux runner means installing GTK and WebKit development packages for what is otherwise a few seconds of work.

What is covered:

- `test/timeline.test.js` — placing, overlap, moving between tracks, trimming against the source bounds, splitting, snapping, track limits, and reading an older project file
- `crates/render/src/ffmpeg.rs` — one test per feature of the filter graph, plus the preset sizes and the progress parser
- `crates/render/src/probe.rs` — ffprobe output including the cover art case, where an mp3 reports a video stream
- `crates/render/src/tools.rs` — where ffmpeg is looked for

### What the tests cannot tell you

The filter graph is a string. It type checks whatever it says, and a mistake in it surfaces at render time on the user's machine and nowhere else. The tests assert the string, which catches a change that did not mean to alter the graph, but the first version of any new graph feature has to be run against a real ffmpeg once.

The way to do that without committing anything: build a project file, print the arguments, run them.

```bash
cd workspace/src-tauri
cargo run -q -p makevideo-render --example print-args 2>/dev/null || true   # no example; use a scratch bin
```

There is no example binary in the tree, deliberately — the check is a one-off. Write a five line `main` in a scratch crate that depends on `makevideo-render` by path, deserialize a project, call `ffmpeg::build_args`, and print the arguments NUL separated. Then feed them to ffmpeg and probe the result. Synthetic inputs are enough:

```bash
ffmpeg -f lavfi -i "color=c=red:s=1280x720:d=6:r=30" -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest red.mp4
ffmpeg -f lavfi -i "color=c=green:s=640x480:d=4:r=30" -an -c:v libx264 -pix_fmt yuv420p green.mp4
```

Two clips of different aspect ratios on two tracks is the case worth checking, because it exercises the transparent pad: with a red clip on V1 and a green 4:3 clip on V2, a frame from the overlap must be green in the middle and red at the edges. Read the pixels by decoding a whole frame to `rawvideo`/`rgb24` and indexing into it. A `crop` filter to get one pixel is the obvious approach and it fails on a seeked single frame.

## Looking at the page without the app

`src/index.html` opens in a plain browser. `api.js` installs a fallback `window.api` and throws, which stops the Tauri path and leaves the layout, the timeline and every keyboard shortcut working. Media will not load, because the asset protocol is not there.

`globalThis.makevideo` exposes `state`, `refresh()`, `preview()` and the timeline library, which is what the devtools console is for. `lib.rs` opens the devtools automatically in debug builds.

## Caveats

**Capabilities fail at runtime, not at compile time.** A plugin command missing from `capabilities/default.json` works in every test and breaks on the user's machine. The generated `src-tauri/gen/schemas/desktop-schema.json` lists every valid identifier; it exists after any build and is worth grepping when adding one.

**The hardware encoder path has never run where it was written.** VideoToolbox is macOS only; the dev container and the pull request runner are Linux. What has been checked there is the shape of it: that the detection narrows to the right candidate, that the trial encode rejects an encoder ffmpeg lists but cannot run (`h264_nvenc` with no libcuda), that a failed hardware attempt followed by the CPU command produces a correct file, and that both commands carry an identical filter graph. The first real `h264_videotoolbox` run happens on a Mac. If it misbehaves, the fallback means a slow render rather than a broken one — and `Settings → Render acceleration → CPU only` turns it off.

**An app launched from Finder has a bare PATH.** It is `/usr/bin:/bin:/usr/sbin:/sbin` — no login shell, so no `/opt/homebrew/bin`. Looking up `ffmpeg` by name alone works under `npm start` and fails in the installed app, which is the worst shape a bug can take. `tools.rs` tries the absolute paths first and the bare name last.

**The asset protocol scope is in memory.** It has to be re-granted on every run, which `open_project` does for the project's assets.

**A media element per clip is a decoder per clip.** `preview.prune()` removes elements whose clips are gone and has to be called after any edit that drops clips.

## Release

`.github/workflows/release-akbun-makevideo.yml`.

- A pull request runs `verify` on ubuntu: the two test suites and nothing else. No Rust cache, because the render crate compiles in seconds.
- A push to master builds on macOS and `tauri-apps/tauri-action` creates the release. **GitHub creates the tag from the release**, so there is no `git tag` step to add.
- The version lives only in `workspace/package.json`; `tauri.conf.json` points at it. The number in `Cargo.toml` is not read by the bundler.

### Bump the version or the release is a lie

tauri-action does not fail on an existing release, it republishes over it. The build goes green, the release page looks right, and the contents are the previous version. `check()` in an installed copy then returns null forever.

So after merging anything that touched `workspace/`, confirm the new version actually shipped:

```bash
gh release list | head
```

### The updater

The app polls a fixed tag, `akbun-makevideo-updater`, rather than `releases/latest`. Several products release from this repository, so the repository-wide "latest" is whichever product shipped last; an installed copy of this app would keep being offered someone else's build. The release job downloads `latest.json` from the version tag and re-uploads it to the fixed tag.

`createUpdaterArtifacts: true` is what produces the `.sig`. Without it tauri-action **silently** skips uploading `latest.json` — the release looks complete and nobody can update.

### The signing key

`plugins.updater.pubkey` in `tauri.conf.json` is the public half. The private half is the repository secret `TAURI_SIGNING_PRIVATE_KEY_MAKEVIDEO`, with `TAURI_SIGNING_PRIVATE_KEY_MAKEVIDEO_PASSWORD` for its password (empty for this key).

**Losing the private key means never updating installed users again.** There is no recovery: their copy rejects a signature from a new key. A GitHub secret cannot be read back, so it needs a backup somewhere else.

### Unsigned builds

The dmg is not code signed, so Gatekeeper quarantines it. The release notes carry the bypass:

```bash
xattr -cr /Applications/akbun-makevideo.app
```

Updates installed by the app itself do not need it — a file the app downloaded carries no quarantine attribute.
