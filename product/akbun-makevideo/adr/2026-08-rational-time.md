# Time is a frame count on a rate of two integers

## Decision

A time is a value counted in units of `1/rate` seconds, and a rate is `num/den`. The project timebase is `settings.rate`, so every clip time in the file — `start`, `in`, `out` — is a frame index on it. `crates/time` and `src/time.js` hold the whole of the arithmetic: conversion, add, subtract, compare, clamp, rescale. The project file carries `version`, and a version 1 file, which measured milliseconds, is converted once as it is read.

The millisecond integers this replaces are gone from the timeline. They survive in exactly three places, each of which is a measurement rather than a decision: an asset's `durationMs` from ffprobe, the render progress bar, and the numbers in a quality report.

## Reason

The frame rate was a `u32`, so 29.97 could not be written down at all. Most camera files are 29.97 or 23.976, and both are ratios — 30000/1001 and 24000/1001 — so there was no rate to put in the field and no way to hold the footage as it actually is.

Underneath that, `layout.rs` worked out the time of a frame as `index * 1000 / fps` in whole milliseconds. At 30 fps the second frame came out 66 where the truth is 66.67, and the error grew with the index. Every seek, every `-ss`, every decoder start went through that division. On a rate of 30 it happened to divide evenly often enough to hide; on 29.97 it would have been 60 ms out — nearly two frames — by the end of the first minute.

A frame index and a time are the same number once the unit is the frame. That is the entire mechanism: the conversion that used to round has nothing left to divide, so `frame_count` stopped needing a ceiling, the composited render stopped multiplying a millisecond position by a rate to find where to start a decoder, and audio moved from `adelay` in whole milliseconds to `adelay` in samples.

Storing the rate as a decimal would have thrown all of that away at the first save, which is why it is two integers and why `Rate::nearest` exists: a file that says `29.97` meant 30000/1001, so it is read as the ratio rather than believed as a decimal.

The two implementations — Rust and JavaScript — are the cost. It is the same cost the model itself already pays, for the same reason ([the editing model lives in the page](./2026-08-timeline-model-in-the-page.md)), and the two sides run the same tests over the same eight rates: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60. A frame that lands one out only does it on particular pairs of rates, which is not something anybody finds by hand.

What this does not do is drop frame timecode. The clock reads `h:mm:ss:ff` and counts thirty frames to the second on 29.97, so it runs a little behind the wall clock over an hour. That is what non drop timecode has always been, and it is a display question rather than a model one — the model underneath is exact either way.
