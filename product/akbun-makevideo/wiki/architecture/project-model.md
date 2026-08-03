# The project model

One JSON object, written to a `.akbunvideo` file and read back by both sides.

```text
project
  settings { width, height, fps }          the editing canvas
  assets[] { id, path, name, kind,         kind is video | audio | image
             durationMs, width, height, hasAudio }
  tracks[] { id, kind, name, muted, hidden,
             clips[] { id, assetId, startMs, inMs, outMs, volume, opacity } }
```

- `startMs` is the position on the timeline. `inMs`/`outMs` are the span taken out of the source, so a clip's length is `outMs - inMs` and its end is `startMs + (outMs - inMs)`.
- An asset's `id` is a hash of its path, so importing the same file twice updates one row instead of adding a second, and a project reopened next week still points its clips at the same assets.
- Video tracks composite in array order: track 1 is the bottom layer. The timeline draws them reversed so V1 sits at the bottom of the screen, which is where every other editor puts it.
- `hidden` on a video track removes it from the preview, the render **and** the timeline length. `muted` silences a track but keeps its picture.

The page defines this shape; Rust reads it back through serde with `rename_all = "camelCase"`. Every clip field added later needs a `#[serde(default)]` on the Rust side or an older project file stops opening.
