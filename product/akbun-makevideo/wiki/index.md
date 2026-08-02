# akbun-makevideo wiki

Read this before changing anything.

| Page | What it covers |
|---|---|
| [architecture/](./architecture/index.md) | How it is put together, one page per part |
| [development.md](./development.md) | Build, run, test, release, the updater signing key, caveats |

The one-paragraph version: a Tauri app whose page (plain HTML/JS, no bundler) is the whole editor. The page owns the project as a JSON object, draws the timeline from it, and previews it by stacking real `<video>` and `<audio>` elements driven by a clock. Rust owns the file system and the processes: it probes imported media with ffprobe, reads and writes the project file, and runs the render by building an ffmpeg filter graph. The pure halves — the timeline arithmetic in `src/timeline.js` and the ffmpeg command in `src-tauri/crates/render` — are tested without an app binary and without ffmpeg installed.

A project is a folder under a workspace directory, and **importing media references it rather than copying it**. That is the first thing to know before changing anything about files: [architecture/workspace-and-files.md](./architecture/workspace-and-files.md).
