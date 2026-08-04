# The timeline model

`src/timeline.js` holds all the arithmetic: placing, moving, trimming, splitting, snapping, and answering what is under the playhead. It has no DOM access, so `node --test` covers it.

It is in the page because a drag has to answer on the next frame. A round trip to Rust per mouse move would not keep up, and the model would then exist on both sides anyway. Rust reads the same shape for the render and the project file, so the two halves agree without either reimplementing the other.

## What a time is

Every time this file takes and returns is a frame index on the project rate, and `src/time.js` is where anything that crosses a unit boundary happens: milliseconds from ffprobe, seconds from a media element, another rate. `crates/time` is the same model on the Rust side, tested over the same eight rates. The reason it is a frame count rather than a millisecond is in [rational time](../../adr/2026-08-rational-time.md).

Two consequences worth knowing before reading the code:

- Lengths that read as wall clock are stated in seconds and converted, because a tenth of a second is three frames of 30 and six of 60. That is `MIN_CLIP_SECONDS`, `DEFAULT_IMAGE_SECONDS` and the ruler tick steps.
- Pixels convert through the rate too: `framesToPx` and `pxToFrames` take it. The playhead is allowed a fractional frame, because a media clock does not stop on frame boundaries; anything that edits the model rounds first.

The one rule that follows from where this lives: **nothing in `timeline.js` may touch the DOM or `window.api`**, or the tests stop running.
