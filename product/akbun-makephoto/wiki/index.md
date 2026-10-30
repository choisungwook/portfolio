# akbun-makephoto wiki

Read this before changing the app. The decisions behind it are in [../adr/index.md](../adr/index.md).

## Pages

| Page | What it covers |
|---|---|
| [architecture.md](./architecture.md) | Processes, crates, the image pipeline, the command surface, how the CLI and the app share state |
| [development.md](./development.md) | Build, run, test, release, and the traps already found |
| [cli.md](./cli.md) | Every CLI command, for agents that drive the catalog without the app |

## In one paragraph

`makephoto-core` owns everything: the catalog file, the edit model, decoding, rendering, auto analysis and film looks. The Tauri app and the `makephoto` CLI are two thin callers of it. They never talk to each other; they share one JSON catalog that every writer locks, rewrites atomically and stamps with a new revision, and the page polls that revision. Originals are only ever read.
