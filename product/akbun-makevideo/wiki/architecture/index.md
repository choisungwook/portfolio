# Architecture

One page per part, because this grew out of a single file. Read [processes.md](./processes.md) first; the rest can be read on demand.

| Page | What it covers |
|---|---|
| [processes.md](./processes.md) | What runs where: the page, the Tauri app crate, the render crate |
| [project-model.md](./project-model.md) | The JSON a project is, and the rules the two sides agree on |
| [workspace-and-files.md](./workspace-and-files.md) | The workspace folder, what a project folder holds, and why media is never copied |
| [timeline.md](./timeline.md) | Why the editing model lives in JavaScript |
| [preview.md](./preview.md) | Stacked media elements, the clock, and what preview quality really changes |
| [render.md](./render.md) | The ffmpeg filter graph, line by line, and the render presets |
| [acceleration.md](./acceleration.md) | GPU encoding: detection by trial, and the fallback |
| [ipc.md](./ipc.md) | The command surface, the asset protocol, and the key flows |

Three things are easy to break by accident and hard to notice:

1. **Importing references media, it never copies it.** [workspace-and-files.md](./workspace-and-files.md)
2. **The preview is not the render.** They are two independent implementations of the same timeline and they can disagree. [preview.md](./preview.md)
3. **The filter graph fails on the user's machine or nowhere.** It is a string, so a mistake in it compiles and type checks. [render.md](./render.md)
