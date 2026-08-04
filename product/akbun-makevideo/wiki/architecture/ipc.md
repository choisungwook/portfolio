# The IPC surface

Every command is in `src-tauri/src/commands.rs`. The page picks paths with native dialogs and hands them over, so nothing here blocks on UI.

| Command | What it does |
|---|---|
| `bootstrap` | Settings, app version, config dir, and where ffmpeg and ffprobe were found |
| `save_settings` | Persists, applies the window theme, returns a fresh bootstrap |
| `import_assets` | Filters by extension, grants the asset protocol scope, probes with ffprobe. Changes no state |
| `edit_state` | The open document: the project, the revision, and whether there is anything to undo |
| `edit_apply` | Applies a list of commands as one undo step and returns the new state |
| `edit_undo` / `edit_redo` | One step either way |
| `describe_asset` | What a media element measured a file to be. Not an edit, so not undoable |
| `new_document` | Starts again on an empty timeline |
| `open_project` / `save_project` | Reads and writes the project file; opening re-grants the scope for every asset |
| `preview_frame` | One composited frame of the open document |
| `start_render` | Spawns ffmpeg, returns immediately, emits `render:progress` then one `render:done` |
| `cancel_render` | Kills the running ffmpeg |

## Nothing carries a project across

`edit_apply` sends commands and `preview_frame` and `start_render` send neither a project nor a timeline. There is one copy of the edit, in `AppState.document`, and everything reads that. The [edit model record](../../adr/2026-08-edit-model-in-rust.md) has the reasoning; the practical effect is that the compositor decides what to decode by reading the timeline rather than by being handed a snapshot taken when somebody pressed a button.

A render takes its own copy and remembers the revision it took, because the app stays editable while it runs. When it finishes, `render:done` carries `edited` if the revision moved, and the dialog says the file is the timeline as it was when the render started.

## The asset protocol

Local media cannot be loaded with `file://`. It goes through `convertFileSrc()` and the asset protocol, which needs all four of: the `protocol-asset` cargo feature, `assetProtocol.enable`, `img-src` **and** `media-src` in the CSP, and a runtime scope grant.

The scope grant lives in memory only. Every path is granted per file in `import_assets` and again in `open_project`, because a project opened in a new run has granted nothing and every preview would be blank with no error anywhere.

## Key flows

**Dropping files from Finder.** Tauri intercepts the OS drop, so HTML5 drop events never fire for external files. `onDragDropEvent` gives paths and a position in *physical* pixels; the page divides by `devicePixelRatio` and asks `elementFromPoint` which lane it landed on. Tauri has been known to deliver one drop as two events, so `api.js` drops a repeat of the same paths within 400 ms — otherwise every clip would be added twice.

**Dragging inside the page.** Asset panel to lane uses HTML5 drag and drop. Moving and trimming clips uses pointer events instead, because they need live feedback: the drag updates only the element's style, and one command goes over on release.

**A file ffprobe could not measure** comes back with `durationMs: 0`. The page fills it in from the media element's `loadedmetadata` through `describe_asset`, so the app works with no ffmpeg installed right up to the point of rendering. That is not an edit and does not go on the undo stack — but if the file turns out to be shorter than the five seconds a clip of it was cut to, the clips are pulled back and the history is dropped with them, because the states it holds were cut against a length that was never true.
