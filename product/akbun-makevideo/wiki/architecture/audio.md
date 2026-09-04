# The audio engine

## What it is for

`crates/audio/` plays the timeline's sound and, while doing it, is the clock everything else follows. Before it the app had no idea what time it was during playback: the preview stacked media elements and let the system add their sound together, and the render mixed with `amix` and never played anything. Neither route left the app holding a position, and both disappear once playback moves into Rust.

Nothing here is connected to the window yet. It is driven by `audio-soak` and by tests, both headless, the same way the frame source landed. A mix that is wrong and a mix that arrives late sound alike through a speaker.

## The sound is the clock

The output's own progress is the master clock and the picture follows it. Not the other way round, and not a third clock both of them chase.

The reason is what each failure costs. A video frame shown a moment late is a frame most people never notice. A gap in the sound is a click, and everybody hears every one of them. Anything that syncs sound to another timebase has to correct the sound when the two disagree, by dropping samples or by resampling on the fly, and both of those are audible. Correcting the picture instead is free.

So `Clock` counts the sample frames actually handed to the device, and that count converted once by the time crate *is* the playhead.

Two details make it honest:

- **Silence written into an underrun is not counted.** The position of playback is how much of the mix has really been played, and a mix that could not be produced was not played. Letting the clock run through a hole would turn a stall you can see into audio that silently vanished.
- **The device's own latency comes off.** cpal reports how far ahead of the speaker each callback runs, so the position is what is being heard rather than what was last handed over.

## The parts

| Module | What it is |
|---|---|
| `mix` | Where each clip sits, in samples, and what mixing them means |
| `source` | One decoder per audible clip on its own thread, filling a bounded queue |
| `engine` | The feeder thread: mix ahead of the sound, and seek by emptying what is in front |
| `realtime` | The lock free ring the callback reads, and the clock it advances |
| `device` | A real output, and what to do when it is unplugged |
| `soak` | Whether any of it keeps up, as a number |

`source` is the frame source next door with the sizes changed, deliberately: the same shape means the same behaviour on a seek, on a broken file and on a clip that ends early. What differs is the cost of a shortfall, and therefore the sizes. A second of stereo is 384 KB against 8.3 MB for one 1080p frame, so being generous with audio buffers is close to free.

One thing does **not** carry across, and it cost a stall to find. The frame source steps one frame per `take`, so a clip can never begin part way through a step, and starting its decoder from the lead alone is enough. This one mixes a block of 1024 frames at a time, so a clip whose first sample falls inside a block is asked for during that block whatever the lead is. `tend` therefore takes the block's end as well as the lead. Without it, a lead shorter than a block and a clip that starts off a block boundary gave a `Starved` that never cleared: the playhead does not move on a starve, so the next call found the same state and refused again.

## Nothing runs in the callback

No allocation, no lock, no file access. Not "as little as possible" — none. The callback is woken a few hundred times a second with a hard deadline each time, and anything that can block can miss it.

`realtime` is the only module the callback touches, so it is the only place the rule can be broken, and two things hold it there. The ring is lock free, with each sample stored as the bits of its f32 in an `AtomicU32`, so there is no `Mutex` in the file to reach for and no `unsafe` block to get wrong. And everything it exposes takes `&self`, so nothing can be handed in that needs resizing.

Everything else — starting decoders, reading files, mixing, resampling sources — happens on the feeder thread, ahead of time.

## One rate, decided once

Everything is mixed at `ENGINE_HZ`, which *is* the render's `AUDIO_HZ` rather than a second constant that happens to match. Sources at other rates are resampled on the way in by ffmpeg, using the same `aformat` filter the export chain opens with.

Doing it any later is what a project with mixed rates punishes. Even a resampler that is a hundredth of a percent off puts the sound a frame away from the picture inside ten minutes. Resampling once, at the edge, against the same implementation the file goes through, makes the drift zero rather than small.

The one resample that is not ffmpeg's is the last one: a device that will not take 48 kHz gets linear interpolation in the callback. It converts a finished mix rather than a source, so it cannot put two clips out of step with each other, and the clock counts engine frames rather than device frames, so a device swap that changes the rate does not move the playhead.

That callback consumes **exactly** the engine frames it uses, worked out up front rather than discovered. Popping one lookahead frame and dropping it would take an extra frame out of the ring every buffer, and since the clock counts what leaves the ring, the playhead would run fast for ever.

## The mix is the render's mix

`amix=normalize=0` is a plain sum: every input at its own level, nothing divided by the number of inputs and nothing limited. `mix::add_into` is that sentence in Rust.

The part worth being careful about is not the addition, it is the offsets. The render places a clip with `adelay=<n>S`, a whole number of samples from `RationalTime::to_samples`. `mix::Region` computes its own offsets with the same call on the same numbers, so neither side rounds twice. The gain is written to the filter graph with six decimals rather than three for the same reason: a clip's volume is an f32 and the mixer multiplies by all of it, so three places make the file up to 5e-4 louder or quieter than what was heard, and silence anything set below 0.0005.

Playback speed changes the timeline-to-source sample mapping. Pitch preservation is on by default and uses ffmpeg `atempo`; disabling it uses sample-rate conversion so pitch moves with speed. Fade-in, fade-out and volume keyframes are multiplied into one gain curve in project-frame time, and the real-time mixer and export graph evaluate the same curve.

The same rule applies to a seek. `Engine::seek_sample` takes an engine sample, so a target can land between two project frames; the `-ss` handed to the decoder is therefore counted in engine samples too. Rescaling it to project frames would round it by up to half a frame — 16.7 ms at 30 fps — while the mixer keeps the exact sample, and the clip would sound that far from where the clock puts it.

One difference is deliberate. A clip's end is anchored to its **end frame on the timeline** rather than derived from its length, so the sample where one clip stops is exactly the sample where the next one starts. Working from the length instead leaves clips on a rate like 29.97 overlapping or gapping by a sample, because the two roundings are taken from different origins.

`tests/amix.rs` mixes the same project both ways and compares the samples, with sources at 44.1 kHz and 48 kHz because a project already at 48 kHz would pass with the offsets computed almost any way at all. It needs ffmpeg; the verify job installs one.

## Which clips are audible

`layout::carries_sound` decides, and both the render and the mixer ask it. A hidden track is out whatever kind it is — hiding a video track to see what is under it silences it too. A muted track is out whichever kind it is, which for a video track means the picture stays and the sound goes. An asset with no sound track contributes nothing, and a still never does.

One rule with three parts and two callers. Two answers to it would be a clip that plays and does not render, or the other way round.

## Seeking

Three things in one order:

1. Ask the ring to flush, and wait for the callback to say it has.
2. Move the source.
3. Move the clock's origin to where the source landed.

Moving the clock before the flush would count the old position's samples against the new origin, and the position would then read a ring's worth ahead of what is heard — permanently, because nothing later corrects it.

**Only the consumer may empty the ring**, so a flush is asked for and answered rather than done. That has a consequence worth knowing: whatever is playing has to keep asking for buffers while a seek is settling. Something that stops to wait for the seek is waiting for the one thing only it can cause. `Engine::settled` is how a caller tells "the ring is full of the old position" from "the ring is full of the new one".

There is **no deadline** on that wait, and there was one once. Giving up and carrying on looks reasonable — a flush nobody answers means nobody is listening — and it is exactly backwards. A consumer that is not running is precisely the state in which the ring is still full of the old position. Pushing there gets the new position's samples thrown away by the flush when it finally lands, while the clock has already moved, and the result is a clock permanently ahead of the sound. Waiting instead costs nothing: a ring nobody drains is a ring nobody hears.

## How far ahead to run

The feeder tops the ring up to `TARGET_FILL` — 3072 frames, 64 ms — and then sleeps. The rest of the ring's 8192 frames is headroom for the times the thread is not scheduled when it wanted to be.

Not brim full, because a full ring is latency: press play and the first thing heard would be whatever was mixed a fifth of a second ago, and every seek would throw all of it away.

## Unplugging is normal

It is somebody taking their headphones off, not an error. One thread owns the stream and nothing else does; when the stream reports a device that has gone, or the default output turns out to be a different one, it drops the stream and builds another on whatever the default is now. The ring, the clock and the decoders are untouched, so the position does not jump and the decoders do not restart. What is heard is a gap of a few hundred milliseconds.

The stream is owned by one thread because cpal's `Stream` is not `Send`. That constraint is what shapes the module: no `Mutex<Stream>` to rebuild from elsewhere.

## Building without a sound card

cpal is behind the `device` feature, on by default. `--no-default-features` builds a crate that has never heard of it, which is the shape a build server wants and is also how the mix is proved to stand on its own. On Linux cpal needs ALSA headers to compile at all, which is the other half of why the feature exists.

## Judging it

`cargo run -p makevideo-audio --bin audio-soak` plays the engine against real media with no device and exits non-zero when a scenario misses its limits. What plays the samples is a thread taking one buffer per buffer period, which is what a device does and what a machine with no sound card can also do. The metrics and the numbers measured so far are in [quality/README.md](../../quality/README.md).

The check that carries the most weight is `endedOnTheSample`: playing a timeline through has to land on its last sample and not near it. One sample short and it fails, which is the whole point of counting samples rather than milliseconds.
