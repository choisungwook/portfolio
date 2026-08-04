# The frame source

## What it is for

`crates/compositor/src/source.rs` turns the timeline into a stream of frames that arrive at playback speed. One decoder per clip, each on its own thread, each filling a bounded queue ahead of the playhead. The consumer never decodes anything; it takes what is already there.

The frame loop used to read every active decoder in turn, one frame at a time. That is fine when the destination is a file: it ties the whole timeline to whichever decoder is slowest, and the render just takes longer. It cannot play. One clip stalling for 40 ms stops every clip for 40 ms.

Nothing here draws, and nothing here is connected to the window yet. It is driven by the supply meter and by the render, both headless. That is deliberate: a frame that arrives late and a frame that is drawn slowly look identical on screen and have nothing to do with each other.

## The parts

| Type | What it is |
|---|---|
| `FrameReader` | Raw frames for one clip, in order. The trait is what makes the buffering testable with no ffmpeg and no media |
| `FfmpegReaders` | The only implementation the app uses: an ffmpeg process per clip, decoding to raw RGBA |
| `Buffering` | `depth`, how many frames a clip may hold ahead; `lead`, how early its decoder starts |
| `FrameSource` | The timeline as frames. `take`, `take_by`, `seek` |
| `Supply` | `Ready`, `Starved` or `End` |

A decoder is opened **on its own thread**, not on the consumer's. Starting one is a process spawn and a file seek, which is tens of milliseconds; doing it on the caller's thread would be a stall on the playhead.

## A starved poll consumes nothing

`take` never blocks and never decodes. It pulls one frame from each clip that should be on screen into a pending slot, and hands the whole set over only when every one of them is there. If any clip is empty, the frames already pulled stay in their slots and the answer is `Starved`.

That is the rule the two-phase pending slot exists for. Consuming the ready clips would tear the frame — clip A at frame 12 next to clip B at frame 11, and from then on for the rest of the timeline.

## Seek is one operation

Empty every queue, refill from the target. Playing and paused take the same path, so there is one behaviour and one thing to test.

`seek` does not wait for anything. The decoders start, `take` says `Starved` until the first frame lands, and the refill shows up in the report as a startup delay rather than as a supply failure. Measured on the generated 1080p30 quality media, that refill is about 130 ms.

A seek also revives a clip whose source had run out: a fresh decoder is a fresh attempt, and a clip that ended before the old playhead may well have frames at the new one.

## What a broken source does

Nothing, loudly. A decoder that cannot be opened, or that runs out early, marks its clip dead, and that clip stops drawing. The timeline runs on and every other clip keeps playing.

This is the same hole the render leaves for media that has moved and the same hole the timeline draws for it. A source failing must never be able to stop playback.

## Memory is bounded by the depth

The queue is a `sync_channel` of `depth`, so a decoder that gets ahead blocks on its send rather than filling memory. The ceiling is `(depth + 1) * width * height * 4` per clip — the extra frame is the pending slot — and `buffer_ceiling()` reports it. The supply meter checks the run against that figure, which turns "bounded" from a claim into a check.

At 1080p a frame is 8.3 MB, so the default depth of 6 is about 50 MB for each clip on screen. That is the number to look at first when 4K with several tracks needs revisiting.

## The render uses it too

`pipeline::run` no longer decodes anything itself. It builds a `FrameSource`, takes frames and composites them, so the frames the render encodes and the frames playback shows are read by one piece of code.

The one difference is what happens on `Starved`: the render waits, because a file has no deadline. It waits in 50 ms spans so that Cancel is still answered promptly.

The render asks for a shallower, later buffer than playback does — depth 3, lead 8. Its queues are there to keep the decoders busy while a frame is composited and encoded, not to absorb jitter, and depth is what it costs: a 4K frame is 33 MB.

## Judging it

`cargo run -p makevideo-compositor --bin supply-soak` runs the source against real media with no window and exits non-zero when a scenario misses its limits. The metrics, the thresholds and the numbers measured so far are in [quality/README.md](../../quality/README.md).

## Testing without ffmpeg

Every buffering test in `source.rs` runs against a fake reader that hands back frames tagged with the clip and the source frame they came from, so a test asserts *which* frame arrived, not only that one did. What that buys is the awkward cases being cheap and exact: a slow clip starving a poll, a queue refusing to grow past its depth, a seek discarding what was buffered, a missing source leaving a hole.

The `supply.rs` tests do the same for the meter, including the one that matters most — a reader deliberately slower than the frame rate has to make the run **fail**. A harness that cannot fail is not measuring anything.
