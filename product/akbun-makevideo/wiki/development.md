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

None of them need an app binary. The first two need nothing installed at all; the third needs a graphics device and ffmpeg.

```bash
npm test           # node --test over the timeline model
npm run test:rust  # cargo test -p makevideo-render, needs nothing installed
npm run test:gpu   # cargo test -p makevideo-compositor, needs a GPU and ffmpeg
```

`-p makevideo-render` is not decoration. The render crate depends on neither tauri nor a webview, so this compiles serde and nothing else. Dropping the `-p` pulls in the app crate, which on a Linux runner means installing GTK and WebKit development packages for what is otherwise a few seconds of work.

The compositor tests are the exception to "no system packages": they draw with a real graphics device and render real files, so they need `mesa-vulkan-drivers` and `ffmpeg`. Both are small, neither adds a Rust dependency, and the verify job installs them. They fail loudly rather than skipping when there is no adapter — a render path nobody has run is what the crate exists to prevent.

```bash
sudo apt-get install -y mesa-vulkan-drivers ffmpeg   # what CI does
```

What is covered:

- `test/timeline.test.js` — placing, overlap, moving between tracks, trimming against the source bounds, splitting, snapping, track limits, and reading an older project file
- `crates/render/src/layout.rs` — where a clip lands in the frame, the case both paths used to answer separately
- `crates/render/src/ffmpeg.rs` — one test per feature of the filter graph, the decoder and encoder arguments for the composited route, the preset sizes and the progress parser
- `crates/render/src/probe.rs` — ffprobe output including the cover art case, where an mp3 reports a video stream
- `crates/render/src/tools.rs` — where ffmpeg is looked for
- `crates/compositor/src/lib.rs` — the shader: layer order, opacity, placement, and that a pillarboxed layer lets the one underneath show at the sides
- `crates/compositor/tests/render.rs` — a real render end to end, and that the preview frame matches the frame the render wrote at the same instant

### What the tests cannot tell you

The composited route is covered end to end by `crates/compositor/tests/render.rs`, which renders real files and reads pixels out of them. **The filter graph route is not.** Its tests assert the argument string, which catches a change that did not mean to alter the graph but proves nothing about what ffmpeg does with it.

So any new feature of that graph has to be run against a real ffmpeg once. Build a project file, print the arguments with a five line scratch crate that depends on `makevideo-render` by path, and feed them to ffmpeg. Synthetic inputs are enough:

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

**The composited route moves a lot of bytes.** Every frame leaves ffmpeg as raw RGBA and goes back the same way, about 250 MB for each second of 1080p30 timeline. On a software rasteriser that made a test render 3.4x slower than the filter graph; on a Mac the drawing is on the GPU and the pipe traffic is what remains. `Settings → Compositor → ffmpeg filter graph` is the faster route when the preview matching the file does not matter.

## Release

`.github/workflows/release-akbun-makevideo.yml`.

- A pull request runs `verify` on ubuntu: the three test suites and nothing else. It installs `mesa-vulkan-drivers` and `ffmpeg` for the compositor tests. No Rust cache, because neither the render nor the compositor crate pulls in tauri.
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

`plugins.updater.pubkey` in `tauri.conf.json` is the public half, and it is committed. The private half is **not in this repository and is not meant to be**. The workflow refers to it by name only:

| Secret | What goes in it |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY_MAKEVIDEO` | The private key generated alongside the committed pubkey |
| `TAURI_SIGNING_PRIVATE_KEY_MAKEVIDEO_PASSWORD` | Its password. Empty for this key, but the secret still has to exist |

Until both are set, the release job runs and produces no `.sig`, and tauri-action then skips `latest.json` **without failing** — a release that looks complete and that nobody can update from. That is the failure to watch for on the first release.

**Losing the private key means never updating installed users again.** There is no recovery: an installed copy rejects a signature from a new key, so the only way out is for every user to download a fresh install by hand. A GitHub secret cannot be read back once set, so the backup has to be somewhere else and has to happen before the key is pasted in.

Regenerating a lost key is a new pubkey in `tauri.conf.json` and a version bump, and everyone already running the app is stranded on their current version. Treat it as unrecoverable and back it up.

### Unsigned builds

The dmg is not code signed, so Gatekeeper quarantines it. The release notes carry the bypass:

```bash
xattr -cr /Applications/akbun-makevideo.app
```

Updates installed by the app itself do not need it — a file the app downloaded carries no quarantine attribute.
