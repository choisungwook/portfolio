//! When a frame reaches the screen, and what it is drawn on.
//!
//! The two stages before this one each solved half of playback and were
//! deliberately left disconnected. `makevideo_compositor::source` produces
//! frames at playback speed; `makevideo_audio` produces the sound and, while
//! doing it, the clock. Neither knows the other exists. This crate is the join,
//! and it is the part the product was actually stuck on: not how to draw a
//! frame, but when to.
//!
//! | Module | What it is |
//! |---|---|
//! | [`schedule`] | The decision, as a pure function over two frame numbers |
//! | [`player`] | One tick of playback: read the clock, carry the decision out |
//! | [`transport`] | Play, pause and seek across the picture and the sound at once |
//! | [`sink`] | Where a frame ends up |
//! | [`surface`] | The swapchain, when there is a window |
//! | [`fallback`] | Which engine runs, and why it might not be this one |
//! | [`soak`] | Whether any of it keeps up, as a number |
//!
//! # The sound leads
//!
//! The audio clock is the playhead. The picture is fitted to it, never the
//! other way round, and a frame that is already late is dropped rather than
//! drawn — see [`schedule::Step::Skip`]. Nothing here ever sends a decoder
//! backwards to catch up, because a decoder sent backwards is a stall, and a
//! stall is the symptom this was written to remove.
//!
//! # Frames do not cross the IPC boundary
//!
//! The page never sees a pixel. It sends transport commands and reads back a
//! position; the picture goes from the frame source to the compositor to the
//! window's own surface without ever being serialised. Sending frames the other
//! way is what the old preview did, and at 1080p30 it is about 250 MB a second
//! of copying — more than the whole real time budget.
//!
//! # Not judged by looking at it
//!
//! Concurrency and timing faults do not converge under a human watching a
//! screen: the failure is intermittent, the observer is unreliable, and every
//! fix looks like it worked. So the acceptance test is [`soak`], the same shape
//! as the frame supply and audio meters, and it exits non-zero.

pub mod fallback;
pub mod player;
pub mod schedule;
pub mod sink;
pub mod soak;
pub mod transport;

#[cfg(feature = "gpu")]
pub mod surface;

pub use fallback::{choose, Choice, Engine};
pub use player::{Scheduler, Sink, Tick};
pub use schedule::{step, Step, DEFAULT_RESYNC};
pub use transport::{Setup, Transport};
