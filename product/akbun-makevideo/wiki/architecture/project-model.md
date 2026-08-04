# The project model

One JSON object, written to a `.akbunvideo` file and read back by both sides.

```text
project
  version                                  the storage format, 2 today
  settings { width, height, rate }         the canvas, and the timebase
    rate   { num, den }                    frames per second, 30000/1001 for 29.97
  assets[] { id, path, name, kind,         kind is video | audio | image
             durationMs, width, height, hasAudio }
  tracks[] { id, kind, name, muted, hidden,
             clips[] { id, assetId, start, in, out, volume, opacity } }
```

- `start`, `in` and `out` are frame indexes on `settings.rate`. `start` is the position on the timeline; `in`/`out` are the span taken out of the source, so a clip's length is `out - in` and its end is `start + (out - in)`. No division appears anywhere in that, which is the point — see [rational time](../../adr/2026-08-rational-time.md).
- `durationMs` on an asset is the one time left in milliseconds. It is what ffprobe measured about a file rather than a position on the timeline, and it becomes frames the moment a clip is made from it.
- An asset's `id` is a hash of its path, so importing the same file twice updates one row instead of adding a second, and a project reopened next week still points its clips at the same assets.
- Video tracks composite in array order: track 1 is the bottom layer. The timeline draws them reversed so V1 sits at the bottom of the screen, which is where every other editor puts it.
- `hidden` on a video track removes it from the preview, the render **and** the timeline length. `muted` silences a track but keeps its picture.

## Versions

Version 1 was the first format: every time in whole milliseconds (`startMs`, `inMs`, `outMs`) and `settings.fps` as a single integer. Version 2 is the shape above.

A version 1 file still opens. `crates/edit/src/migrate.rs` converts it once as it is read, and what gets written back is version 2 only, with the millisecond keys gone rather than carried along beside the frame counts that replaced them. Which format a clip is in is read off the clip rather than taken from the header, because the two use different keys and a header can be wrong.

A version 1 file whose `fps` says `29.97` opens on 30000/1001, because that is what the number meant. Believing the decimal is how the approximation gets back in.

## Changing the rate

Changing the rate in Project Settings rescales every clip to the nearest frame of the new one, so a cut stays where it was in time rather than keeping its frame number. Between rates that divide — 30 and 60 — it is exact and reversible. Between 23.976 and 24 it is not, and a clip can move by up to half a frame, which is as close as the new rate can hold.

## One implementation

Rust defines this shape, in `crates/edit`, and the page reads it. There is no second definition to keep in step any more — the page never constructs a project, it draws one. Every clip field added later still needs a `#[serde(default)]`, or an older project file stops opening.

## What is guaranteed about a clip

A clip that comes out of the model has a length, has a non-negative in point, does not reach past the end of its source, and does not overlap its neighbours. Those are checked after every command; the reasoning and the one exception — opening a file repairs rather than refuses — are in [the timeline model](./timeline.md).
