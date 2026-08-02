# akbun-makevideo wiki

Read this before changing anything.

| Page | What it covers |
|---|---|
| [architecture.md](./architecture.md) | Process structure, the project model, the IPC surface, key flows |
| [development.md](./development.md) | Build, run, test, release, the updater signing key, caveats |

The one-paragraph version: a Tauri app whose page (plain HTML/JS, no bundler) is the whole editor. The page owns the project as a JSON object, draws the timeline from it, and previews it by stacking real `<video>` and `<audio>` elements driven by a clock. Rust owns the file system and the processes: it probes imported media with ffprobe, reads and writes the project file, and runs the render by building an ffmpeg filter graph. The pure halves — the timeline arithmetic in `src/timeline.js` and the ffmpeg command in `src-tauri/crates/render` — are tested without an app binary and without ffmpeg installed.

Two things to know before touching anything:

1. **The preview is not the render.** They are two independent implementations of the same timeline, and they can disagree. See [architecture.md](./architecture.md#the-preview-is-an-approximation).
2. **The filter graph fails on the user's machine or nowhere.** It is a string, so a mistake in it compiles, passes type checks, and only surfaces at render time. That is why `ffmpeg.rs` has a test per graph feature.
