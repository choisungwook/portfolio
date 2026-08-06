//! Playing a timeline's sound, and being the clock everything else follows.
//!
//! Until now the app has had no idea what time it was during playback. The
//! preview stacks media elements, each one plays its own sound, and the system
//! adds them up somewhere below the application; the render mixes with ffmpeg's
//! `amix` and never plays anything. Neither route leaves the app holding a
//! position, and both of them disappear the moment playback moves into Rust.
//!
//! So this crate does three things.
//!
//! | Part | What it is |
//! |---|---|
//! | [`source`] | One decoder per audible clip on its own thread, filling a bounded queue |
//! | [`mix`] | Where each clip sits in samples, and what mixing them means |
//! | [`engine`] | The feeder thread: mix ahead of the sound, and seek by emptying what is in front |
//! | [`realtime`] | The lock free ring the callback reads, and the clock it advances |
//! | [`device`] | A real output, and what to do when it is unplugged |
//! | [`soak`] | Whether any of it keeps up, as a number |
//!
//! # The sound is the clock
//!
//! The output's own progress is the master clock and the picture follows it.
//! Not the other way round, and not a third clock that both of them chase.
//!
//! The reason is what each failure sounds like. A video frame shown a moment
//! late is a frame most people never notice, and one dropped entirely is a
//! flicker. A gap in the sound is a click, and everybody hears every one of
//! them. Anything that syncs sound to another timebase has to correct the sound
//! when they disagree — by dropping samples, or by resampling on the fly — and
//! both of those are audible. Correcting the picture instead is free.
//!
//! So [`realtime::Clock`] counts the sample frames actually handed to the
//! device and that count, converted once by the time crate, *is* the playhead.
//!
//! # One rate, decided once
//!
//! Everything is mixed at [`realtime::ENGINE_HZ`], which is the render's
//! `AUDIO_HZ` rather than a second constant that happens to match. Sources at
//! other rates are resampled on the way in, by ffmpeg, using the same
//! `aformat` filter the export chain opens with.
//!
//! Doing it any later is what a project with mixed rates punishes. Twenty
//! minutes of 44.1 kHz material played as though it were 48 kHz is not slightly
//! wrong, it is minutes wrong, and even a resampler that is a hundredth of a
//! percent off puts the sound a frame away from the picture inside ten minutes.
//! Resampling once, at the edge, against the same implementation the file goes
//! through, is what makes the drift zero rather than small.
//!
//! # Nothing runs in the callback
//!
//! No allocation, no lock, no file access, ever. [`realtime`] is where that
//! rule is written down and where it is enforced; everything else in this
//! crate exists to have the samples finished before the callback asks for them.
//!
//! # Not connected to the window
//!
//! Deliberately, exactly as the frame source was when it landed. The engine is
//! driven by [`soak`] and by tests here, both headless. A mix that is wrong and
//! a mix that arrives late sound alike, and the only way to tell them apart is
//! to measure one of them with the other held still.

pub mod engine;
pub mod mix;
pub mod realtime;
pub mod soak;
pub mod source;

#[cfg(feature = "device")]
pub mod device;

pub use engine::Engine;
pub use realtime::{Clock, ENGINE_HZ};
