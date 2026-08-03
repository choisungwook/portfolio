# The IPC surface

Every command is in `src-tauri/src/commands.rs`. The page picks paths with native dialogs and hands them over, so nothing here blocks on UI.

| Command | What it does |
|---|---|
| `bootstrap` | Settings, app version, config dir, and where ffmpeg and ffprobe were found |
| `save_settings` | Persists, applies the window theme, returns a fresh bootstrap |
| `import_assets` | Filters by extension, grants the asset protocol scope, probes with ffprobe |
| `open_project` / `save_project` | Reads and writes the project file; opening re-grants the scope for every asset |
| `start_render` | Spawns ffmpeg, returns immediately, emits `render:progress` then one `render:done` |
| `cancel_render` | Kills the running ffmpeg |

## The asset protocol

Local media cannot be loaded with `file://`. It goes through `convertFileSrc()` and the asset protocol, which needs all four of: the `protocol-asset` cargo feature, `assetProtocol.enable`, `img-src` **and** `media-src` in the CSP, and a runtime scope grant.

The scope grant lives in memory only. Every path is granted per file in `import_assets` and again in `open_project`, because a project opened in a new run has granted nothing and every preview would be blank with no error anywhere.

## Key flows

**Dropping files from Finder.** Tauri intercepts the OS drop, so HTML5 drop events never fire for external files. `onDragDropEvent` gives paths and a position in *physical* pixels; the page divides by `devicePixelRatio` and asks `elementFromPoint` which lane it landed on. Tauri has been known to deliver one drop as two events, so `api.js` drops a repeat of the same paths within 400 ms — otherwise every clip would be added twice.

**Dragging inside the page.** Asset panel to lane uses HTML5 drag and drop. Moving and trimming clips uses pointer events instead, because they need live feedback: the drag updates only the element's style, and the model is changed once on release.

**A file ffprobe could not measure** comes back with `durationMs: 0`. The page fills it in from the media element's `loadedmetadata`, so the app works with no ffmpeg installed right up to the point of rendering.
