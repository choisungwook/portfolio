# akbun-makepresentation wiki

Read this before changing anything.

| Page | What it covers |
|---|---|
| [architecture.md](./architecture.md) | Process structure, the deck model, the IPC surface, key flows |
| [development.md](./development.md) | Build, run, test, release, the updater signing key, caveats |

The one-paragraph version: a Tauri app whose page (plain HTML/JS, no bundler) is the whole editor. The page owns the deck as a JSON object and redraws SVG from it. Rust owns the file system: it reads and writes .pptx and assembles the .pdf. The pure model lives in `src-tauri/crates/deck` so CI tests it without compiling Tauri.
