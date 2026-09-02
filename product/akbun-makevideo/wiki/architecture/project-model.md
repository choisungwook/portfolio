# The project model

One JSON object, written to a `.akbunvideo` file and read back by both sides.

```text
project
  version                                  the storage format, 3 today
  settings { width, height, rate }         the canvas, and the timebase
    rate   { num, den }                    frames per second, 30000/1001 for 29.97
  assets[] { id, path, name, kind,         kind is video | audio | image
             durationMs, width, height, hasAudio }
  tracks[] { id, kind, name, muted, hidden,
             clips[] { id, assetId, start, in, out, volume, opacity },
             visualItems[] { id, start, duration, zIndex,
               transform { x, y, width, height, rotation, opacity },
               content { kind, ... } } }
```

- `start`, `in` and `out` are frame indexes on `settings.rate`. `start` is the position on the timeline; `in`/`out` are the span taken out of the source, so a clip's length is `out - in` and its end is `start + (out - in)`. No division appears anywhere in that, which is the point — see [rational time](../../adr/2026-08-rational-time.md).
- `durationMs` on an asset is the one time left in milliseconds. It is what ffprobe measured about a file rather than a position on the timeline, and it becomes frames the moment a clip is made from it.
- An asset's `id` is a hash of its path, so importing the same file twice updates one row instead of adding a second, and a project reopened next week still points its clips at the same assets.
- Video tracks composite in array order: track 1 is the bottom layer. The timeline draws them reversed so V1 sits at the bottom of the screen, which is where every other editor puts it.
- Visual items belong to video tracks. Their coordinates and size are project pixels, not Program Monitor pixels. Items on one track draw by ascending `zIndex`, then `id`; track array order remains the primary layer order.
- `content.kind` is `text`, `shape`, `image` or `videoOverlay`. Image and video overlay content names an asset; content-specific fields stay inside `content`, not beside the shared transform.
- Text and shape content share `fills[]`, `stroke` and `shadow`. Fills paint bottom to top and each paint is solid, linear gradient, radial gradient, image or video.
- Rectangle, rounded rectangle, ellipse, line, polygon and star use the same transform and visual style. Rounded rectangle alone reads `cornerRadius`; line alone reads its arrow flags.
- Clicking Text or Shape creates or reuses a clip-free top video track. At the four-video-track limit it uses the existing top video track instead. Track creation and item creation are one undo step.
- Selection borders, transform handles and guides are editor state and never appear in `visualItems`.
- `hidden` on a video track removes it from the preview, the render **and** the timeline length. `muted` silences a track but keeps its picture.

## Versions

Version 1 stored every time in whole milliseconds (`startMs`, `inMs`, `outMs`) and `settings.fps` as a single integer. Version 2 introduced frame counts and visual items. Version 3 is the shape above: text and shapes use paint stacks and shared stroke and shadow objects.

Version 1 and 2 files still open. `crates/edit/src/migrate.rs` converts timeline fields as they are read. The visual-content deserializer converts legacy `color`, `fill`, `strokeColor`, `strokeWidth` and shadow fields into the version 3 style. Saving writes version 3 fields only. Which time format a clip uses is read off the clip rather than trusted from the header, because the keys differ and a header can be wrong. A track without `visualItems` opens with an empty list.

A version 1 file whose `fps` says `29.97` opens on 30000/1001, because that is what the number meant. Believing the decimal is how the approximation gets back in.

## Changing the rate

Changing the rate in Project Settings rescales every clip to the nearest frame of the new one, so a cut stays where it was in time rather than keeping its frame number. Between rates that divide — 30 and 60 — it is exact and reversible. Between 23.976 and 24 it is not, and a clip can move by up to half a frame, which is as close as the new rate can hold.

## One implementation

Rust defines this shape, in `crates/edit`, and the page reads it. There is no second definition to keep in step any more — the page never constructs a project, it draws one. Every clip field added later still needs a `#[serde(default)]`, or an older project file stops opening.

## What is guaranteed about a clip

A clip that comes out of the model has a length, has a non-negative in point, does not reach past the end of its source, and does not overlap its neighbours. Those are checked after every command; the reasoning and the one exception — opening a file repairs rather than refuses — are in [the timeline model](./timeline.md).
