//! The realtime boundary: the ring the audio callback reads from, and the
//! clock it advances.
//!
//! # The rule
//!
//! **Inside the audio callback there is no allocation, no lock and no file
//! access.** Not "as little as possible" — none. The callback runs on a thread
//! the operating system wakes a few hundred times a second with a hard deadline
//! each time, and anything that can block can miss it. A missed deadline is not
//! a slow frame that nobody notices; it is a click, and a click is the one
//! artefact every listener hears every time.
//!
//! The rule is written here because this module is the only thing the callback
//! is allowed to touch, so it is the only place the rule can be broken. Two
//! things enforce it in code rather than in prose:
//!
//! - [`Ring`] is lock free. Samples are `AtomicU32` bit patterns, which is
//!   plain loads and stores on every machine this ships to, and the two indexes
//!   are the only synchronisation. There is no `Mutex` in this file to reach
//!   for by accident.
//! - Nothing here owns a `Vec` it might grow, and nothing here takes a `&mut
//!   self`. Everything the callback calls is `&self`, so a caller cannot pass
//!   it something that needs to be resized.
//!
//! The consequence is that all the real work — starting decoders, reading
//! files, mixing, resampling the sources — happens on the feeder thread, ahead
//! of time, and reaches the callback as samples that are already finished. See
//! [`crate::engine`].
//!
//! # Why the samples go through `AtomicU32`
//!
//! A single producer, single consumer ring is usually written with a raw
//! buffer and an `unsafe` block arguing that the two halves never overlap. The
//! argument is correct and it is also the kind of thing that is correct until
//! someone adds a second consumer. Storing each sample as the bits of its f32
//! in an `AtomicU32` needs no `unsafe` at all, and `Relaxed` on the samples
//! with `Acquire`/`Release` on the indexes compiles to the same instructions:
//! the ordering is what costs, and it is paid once per call rather than once
//! per sample.

use makevideo_render::{Rate, RationalTime};
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

/// Interleaved stereo throughout: a sample frame is two f32.
pub const CHANNELS: usize = 2;

/// A lock free single producer, single consumer queue of sample frames.
///
/// Capacity is rounded up to a power of two so the wrap is a mask rather than a
/// remainder. One frame is left unused, which is what lets full and empty be
/// told apart by the indexes alone.
pub struct Ring {
    slots: Box<[AtomicU32]>,
    /// Frames, not samples: the capacity in slots is this times [`CHANNELS`].
    capacity: usize,
    mask: usize,
    write: AtomicUsize,
    read: AtomicUsize,
    /// A seek posts here and the callback answers in `flush_done`. Only the
    /// consumer may move the read index, so emptying the ring has to be asked
    /// for rather than done.
    flush_requested: AtomicU64,
    flush_done: AtomicU64,
}

impl Ring {
    /// Split into the two ends. Each end is not `Clone`, which is how the
    /// single producer, single consumer promise is kept by the type system
    /// rather than by a comment.
    pub fn new(frames: usize) -> (Producer, Consumer) {
        let capacity = frames.max(2).next_power_of_two();
        let ring = Arc::new(Ring {
            slots: (0..capacity * CHANNELS)
                .map(|_| AtomicU32::new(0))
                .collect(),
            capacity,
            mask: capacity - 1,
            write: AtomicUsize::new(0),
            read: AtomicUsize::new(0),
            flush_requested: AtomicU64::new(0),
            flush_done: AtomicU64::new(0),
        });
        (
            Producer {
                ring: Arc::clone(&ring),
            },
            Consumer { ring },
        )
    }

    /// Frames sitting in the ring, waiting to be played.
    ///
    /// Exact on the producer's or the consumer's own thread, because there one
    /// of the two indexes is standing still. From a third thread it is a
    /// snapshot of two values read a moment apart, so it is clamped: without
    /// that, an observation where `read` has moved past the `write` it was
    /// paired with produces a wrapped, arbitrary number instead of an
    /// almost-right one.
    pub fn filled(&self) -> usize {
        let read = self.read.load(Ordering::Acquire);
        let write = self.write.load(Ordering::Acquire);
        write.wrapping_sub(read).min(self.capacity - 1)
    }

    /// Frames that would fit right now. One below the capacity, always.
    pub fn free(&self) -> usize {
        self.capacity - 1 - self.filled()
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

/// The feeder's end. Held by the mixing thread and by nothing else.
pub struct Producer {
    ring: Arc<Ring>,
}

impl Producer {
    /// Write as many whole frames of `samples` as fit, and say how many that
    /// was. Never blocks: a full ring means the feeder is ahead, which is what
    /// it is for.
    pub fn push(&self, samples: &[f32]) -> usize {
        let ring = &self.ring;
        let wanted = samples.len() / CHANNELS;
        let frames = wanted.min(ring.free());
        let mut write = ring.write.load(Ordering::Relaxed);
        for frame in 0..frames {
            let slot = (write & ring.mask) * CHANNELS;
            for channel in 0..CHANNELS {
                ring.slots[slot + channel].store(
                    samples[frame * CHANNELS + channel].to_bits(),
                    Ordering::Relaxed,
                );
            }
            write = write.wrapping_add(1);
        }
        // Release last: the samples above are visible to the consumer before
        // the index that admits they exist.
        ring.write.store(write, Ordering::Release);
        frames
    }

    /// Ask for everything buffered to be thrown away, and say which request
    /// this is.
    ///
    /// Nothing is dropped here. Only the consumer may move the read index, so a
    /// seek posts the request and the callback carries it out on its next
    /// visit. Doing it from this side would race the thread that is reading,
    /// and the reader is the one with a deadline.
    ///
    /// The caller then waits for [`Producer::flushed`] to reach this number
    /// **before pushing anything else**, or the new position's samples are
    /// thrown away along with the old one's.
    pub fn request_flush(&self) -> u64 {
        self.ring.flush_requested.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// The last flush the consumer has carried out.
    pub fn flushed(&self) -> u64 {
        self.ring.flush_done.load(Ordering::SeqCst)
    }

    pub fn filled(&self) -> usize {
        self.ring.filled()
    }

    pub fn free(&self) -> usize {
        self.ring.free()
    }

    pub fn capacity(&self) -> usize {
        self.ring.capacity()
    }

    /// A handle for whoever is watching the ring rather than filling it.
    pub fn view(&self) -> RingView {
        RingView {
            ring: Arc::clone(&self.ring),
        }
    }
}

/// A read only look at how full the ring is, for a meter or a status line.
///
/// Cloneable and usable from any thread, with the caveat on [`Ring::filled`]:
/// off the two owning threads it is a snapshot rather than an exact count, and
/// it can be a moment behind. What it deliberately cannot do is push or pop,
/// which is what keeps the single producer, single consumer promise intact
/// while still letting a third thread watch.
#[derive(Clone)]
pub struct RingView {
    ring: Arc<Ring>,
}

impl RingView {
    pub fn filled(&self) -> usize {
        self.ring.filled()
    }

    pub fn capacity(&self) -> usize {
        self.ring.capacity()
    }
}

/// The callback's end. Every method here is called with a deadline.
pub struct Consumer {
    ring: Arc<Ring>,
}

impl Consumer {
    /// Fill as many whole frames of `out` as the ring holds, and say how many
    /// that was. What is left of `out` is untouched, so the caller decides
    /// whether short means silence or means stop.
    pub fn pop(&self, out: &mut [f32]) -> usize {
        self.take_flush();
        let ring = &self.ring;
        let wanted = out.len() / CHANNELS;
        let frames = wanted.min(ring.filled());
        let mut read = ring.read.load(Ordering::Relaxed);
        for frame in 0..frames {
            let slot = (read & ring.mask) * CHANNELS;
            for channel in 0..CHANNELS {
                out[frame * CHANNELS + channel] =
                    f32::from_bits(ring.slots[slot + channel].load(Ordering::Relaxed));
            }
            read = read.wrapping_add(1);
        }
        ring.read.store(read, Ordering::Release);
        frames
    }

    /// Throw away everything buffered.
    ///
    /// Moves the read index forward to where the producer had got to, which is
    /// a position this side was always allowed to reach, so it is safe against
    /// a producer that is still pushing. What it is not safe against is a
    /// producer that pushed *after* asking for the flush — see
    /// [`Producer::request_flush`].
    pub fn clear(&self) {
        let ring = &self.ring;
        ring.read
            .store(ring.write.load(Ordering::Acquire), Ordering::Release);
    }

    /// Carry out a flush the producer asked for, if there is one.
    ///
    /// Called at the top of every `pop`, and worth calling directly from a sink
    /// whose callback is about to write silence: a seek that arrives while
    /// nothing is playing should still take effect.
    ///
    /// Realtime safe, which it has to be: this runs in the callback.
    pub fn take_flush(&self) {
        let ring = &self.ring;
        let requested = ring.flush_requested.load(Ordering::Acquire);
        if requested == ring.flush_done.load(Ordering::Relaxed) {
            return;
        }
        self.clear();
        ring.flush_done.store(requested, Ordering::Release);
    }

    pub fn filled(&self) -> usize {
        self.ring.filled()
    }
}

/// What time it is, according to the sound.
///
/// The count is frames taken out of the ring, which is frames handed to the
/// device. Silence written into an underrun is deliberately **not** counted:
/// the position of playback is how much of the mix has actually been played,
/// and a mix that could not be produced was not played. The alternative — let
/// the clock run through an underrun — hides the failure by turning it into
/// silently skipped audio, and a stall you can see beats a gap you cannot.
///
/// Every field is an atomic because the callback writes them and the page
/// reads them, and neither may wait for the other.
#[derive(Debug, Default)]
pub struct Clock {
    /// Frames handed to the device since the last `restart`.
    played: AtomicU64,
    /// Where playback began, in engine samples on the timeline.
    origin: AtomicU64,
    /// Frames sitting between the callback and the speaker. Reported by the
    /// device, because only the device knows.
    latency: AtomicU64,
    /// Callbacks that found the ring short of what they asked for.
    underruns: AtomicU64,
    /// Frames of silence those callbacks had to write, which is the size of the
    /// hole rather than the number of holes.
    silent: AtomicU64,
}

impl Clock {
    pub fn new() -> Clock {
        Clock::default()
    }

    /// Begin again from `origin_samples` on the timeline. Called after the ring
    /// has been cleared, never before: the order is what stops the frames mixed
    /// for the old position from being counted against the new one.
    ///
    /// The count is zeroed **before** the origin moves, and
    /// [`Clock::position_samples`] reads them in the opposite order. That pair
    /// of orders is what makes the two stores safe to read without a lock:
    ///
    /// - old origin with old played — the position before the seek.
    /// - old origin with nothing played — where playback last started. Stale,
    ///   but on the timeline and never ahead of it.
    /// - new origin with nothing played — the answer.
    ///
    /// The fourth combination, new origin plus everything played since the old
    /// one, is a playhead somewhere past the end of the timeline, and it is the
    /// one the two orders make impossible: producing it needs the reader to
    /// load `origin` after the second store and `played` before the first,
    /// which is the reader's own two loads happening backwards.
    ///
    /// **Both orders are load bearing.** Reversing either one puts that fourth
    /// combination back.
    pub fn restart(&self, origin_samples: u64) {
        self.played.store(0, Ordering::SeqCst);
        self.origin.store(origin_samples, Ordering::SeqCst);
    }

    /// Called by the callback, once, with what it actually took.
    pub fn advance(&self, frames: u64) {
        self.played.fetch_add(frames, Ordering::Relaxed);
    }

    /// Called by the callback when it could not be filled.
    pub fn starve(&self, silent_frames: u64) {
        self.underruns.fetch_add(1, Ordering::Relaxed);
        self.silent.fetch_add(silent_frames, Ordering::Relaxed);
    }

    /// The device saying how far ahead of the speaker its callback runs.
    pub fn set_latency(&self, frames: u64) {
        self.latency.store(frames, Ordering::Relaxed);
    }

    pub fn played_frames(&self) -> u64 {
        self.played.load(Ordering::Relaxed)
    }

    pub fn underruns(&self) -> u64 {
        self.underruns.load(Ordering::Relaxed)
    }

    pub fn silent_frames(&self) -> u64 {
        self.silent.load(Ordering::Relaxed)
    }

    pub fn latency_frames(&self) -> u64 {
        self.latency.load(Ordering::Relaxed)
    }

    /// Where playback is, in engine samples on the timeline.
    ///
    /// The device latency comes off, so this is what is being heard now rather
    /// than what was last handed over. At the very start that would be a
    /// negative time, and the answer there is the position playback began at.
    ///
    /// `origin` is loaded **first** and `played` second. That is the other half
    /// of the pair described on [`Clock::restart`], and it is what stops a
    /// reader that happens to run across a seek from combining the new origin
    /// with the old count and reporting a playhead past the end of the
    /// timeline.
    pub fn position_samples(&self) -> u64 {
        let origin = self.origin.load(Ordering::Relaxed);
        let played = self
            .played
            .load(Ordering::Relaxed)
            .saturating_sub(self.latency.load(Ordering::Relaxed));
        origin + played
    }

    /// The same instant as a time on the project rate, which is what the
    /// playhead and the frame source take.
    ///
    /// Rounded to the nearest frame of `rate` by the time crate, so this is the
    /// one place the audio clock becomes a video position and there is nothing
    /// left to round anywhere else.
    pub fn position(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.position_samples() as i64, Rate::new(ENGINE_HZ, 1)).rescaled(rate)
    }
}

/// Every sample in this crate is at this rate. It is the render's `AUDIO_HZ`
/// rather than a number of its own, so the mix that plays and the mix that is
/// written are on one timebase by construction.
pub use makevideo_render::ffmpeg::AUDIO_HZ as ENGINE_HZ;

#[cfg(test)]
mod tests {
    use super::*;

    fn ramp(from: usize, frames: usize) -> Vec<f32> {
        (0..frames * CHANNELS)
            .map(|index| (from * CHANNELS + index) as f32)
            .collect()
    }

    #[test]
    fn what_goes_in_comes_out_in_order() {
        let (producer, consumer) = Ring::new(64);
        assert_eq!(producer.push(&ramp(0, 10)), 10);
        let mut out = vec![0.0; 10 * CHANNELS];
        assert_eq!(consumer.pop(&mut out), 10);
        assert_eq!(out, ramp(0, 10));
        assert_eq!(consumer.filled(), 0);
    }

    #[test]
    fn a_full_ring_takes_what_fits_and_says_so() {
        // One frame short of the capacity, always: that spare frame is what
        // makes full and empty different states rather than the same indexes.
        let (producer, _consumer) = Ring::new(8);
        assert_eq!(producer.capacity(), 8);
        assert_eq!(producer.push(&ramp(0, 100)), 7);
        assert_eq!(producer.free(), 0);
        assert_eq!(producer.push(&ramp(0, 1)), 0);
    }

    #[test]
    fn an_empty_ring_leaves_the_rest_of_the_buffer_alone() {
        // The callback fills the remainder with silence itself, because only it
        // knows whether short means silence or means stop.
        let (producer, consumer) = Ring::new(64);
        producer.push(&ramp(0, 3));
        let mut out = vec![-1.0; 10 * CHANNELS];
        assert_eq!(consumer.pop(&mut out), 3);
        assert_eq!(&out[..3 * CHANNELS], &ramp(0, 3)[..]);
        assert!(out[3 * CHANNELS..].iter().all(|sample| *sample == -1.0));
    }

    #[test]
    fn the_indexes_wrap_without_losing_a_frame() {
        // Ten times round a small ring. Getting the mask wrong shows up as a
        // sample from the wrong place rather than as a crash, which is why the
        // values are checked and not only the counts.
        let (producer, consumer) = Ring::new(8);
        let mut out = vec![0.0; 5 * CHANNELS];
        for round in 0..10 {
            let sent = ramp(round * 5, 5);
            assert_eq!(producer.push(&sent), 5);
            assert_eq!(consumer.pop(&mut out), 5);
            assert_eq!(out, sent, "round {round}");
        }
    }

    #[test]
    fn clearing_drops_what_was_buffered_for_the_old_position() {
        let (producer, consumer) = Ring::new(64);
        producer.push(&ramp(0, 20));
        consumer.clear();
        assert_eq!(consumer.filled(), 0);
        let mut out = vec![0.0; 4 * CHANNELS];
        assert_eq!(consumer.pop(&mut out), 0);
        // And it is usable again straight away.
        assert_eq!(producer.push(&ramp(99, 4)), 4);
        assert_eq!(consumer.pop(&mut out), 4);
        assert_eq!(out, ramp(99, 4));
    }

    #[test]
    fn a_flush_is_asked_for_on_one_side_and_carried_out_on_the_other() {
        // The seek handshake. The producer cannot empty the ring itself without
        // racing the callback, so it posts and waits, and this is the pair of
        // counters that says when it may start pushing again.
        let (producer, consumer) = Ring::new(64);
        producer.push(&ramp(0, 20));
        let request = producer.request_flush();
        assert_eq!(producer.flushed(), 0, "nothing has answered yet");
        assert_eq!(consumer.filled(), 20, "and nothing has been dropped yet");

        let mut out = vec![0.0; 4 * CHANNELS];
        assert_eq!(consumer.pop(&mut out), 0, "the flush happens first");
        assert_eq!(producer.flushed(), request);

        // Now the new position's samples are safe to push.
        assert_eq!(producer.push(&ramp(500, 4)), 4);
        assert_eq!(consumer.pop(&mut out), 4);
        assert_eq!(out, ramp(500, 4));
    }

    #[test]
    fn a_sink_writing_silence_can_still_answer_a_seek() {
        // A callback that finds the ring empty never reaches `pop`'s copy, so
        // the flush has to be reachable on its own or a seek made while
        // playback is starved never takes effect.
        let (producer, consumer) = Ring::new(64);
        producer.push(&ramp(0, 6));
        let request = producer.request_flush();
        consumer.take_flush();
        assert_eq!(producer.flushed(), request);
        assert_eq!(consumer.filled(), 0);
        // And asking again when there is nothing to do costs nothing and
        // changes nothing.
        consumer.take_flush();
        assert_eq!(producer.flushed(), request);
    }

    #[test]
    fn a_producer_and_a_consumer_on_two_threads_lose_nothing() {
        // The claim the lock free ring is for. A hundred thousand frames
        // through an eight frame ring, checked value by value on the way out:
        // a torn frame or a missed release would show as a gap in the ramp.
        let (producer, consumer) = Ring::new(8);
        let total = 100_000usize;
        let feeder = std::thread::spawn(move || {
            let mut sent = 0usize;
            while sent < total {
                let block = ramp(sent, (total - sent).min(4));
                let done = producer.push(&block);
                if done == 0 {
                    std::thread::yield_now();
                }
                sent += done;
            }
        });

        let mut taken = 0usize;
        let mut out = vec![0.0; 4 * CHANNELS];
        while taken < total {
            let frames = consumer.pop(&mut out);
            for frame in 0..frames {
                assert_eq!(
                    out[frame * CHANNELS],
                    ((taken + frame) * CHANNELS) as f32,
                    "frame {} arrived out of order",
                    taken + frame
                );
            }
            if frames == 0 {
                std::thread::yield_now();
            }
            taken += frames;
        }
        feeder.join().unwrap();
    }

    #[test]
    fn the_clock_counts_what_was_played_and_not_what_was_missed() {
        let clock = Clock::new();
        clock.restart(0);
        clock.advance(480);
        clock.starve(120);
        assert_eq!(clock.played_frames(), 480);
        assert_eq!(clock.position_samples(), 480);
        assert_eq!(clock.underruns(), 1);
        assert_eq!(clock.silent_frames(), 120);
    }

    #[test]
    fn the_device_buffer_comes_off_so_the_position_is_what_is_heard() {
        let clock = Clock::new();
        clock.restart(0);
        clock.set_latency(512);
        clock.advance(2048);
        assert_eq!(clock.position_samples(), 1536);
        // The first callbacks have handed over less than is still in flight,
        // and the answer there is where playback began rather than a time
        // before it.
        clock.restart(96_000);
        clock.advance(100);
        assert_eq!(clock.position_samples(), 96_000);
    }

    #[test]
    fn a_seek_moves_the_origin_and_starts_the_count_again() {
        let clock = Clock::new();
        clock.restart(0);
        clock.advance(48_000);
        assert_eq!(clock.position_samples(), 48_000);
        clock.restart(240_000);
        assert_eq!(clock.position_samples(), 240_000);
        clock.advance(24_000);
        assert_eq!(clock.position_samples(), 264_000);
    }

    #[test]
    fn the_position_becomes_a_frame_on_the_project_rate() {
        let clock = Clock::new();
        clock.restart(0);
        // Two seconds of sound is frame 60 of 30 fps and frame 48 of 24.
        clock.advance(2 * u64::from(ENGINE_HZ));
        assert_eq!(clock.position(Rate::fps(30)).value(), 60);
        assert_eq!(clock.position(Rate::fps(24)).value(), 48);
        // 29.97 is where a decimal rate would have drifted. Two seconds is
        // 59.94 frames of it, and the nearest whole frame is 60.
        assert_eq!(clock.position(Rate::ntsc(30)).value(), 60);

        // Ten minutes, which is where the millisecond model used to be a frame
        // out. 600 seconds of 29.97 is 17982 frames exactly.
        clock.restart(0);
        clock.advance(600 * u64::from(ENGINE_HZ));
        assert_eq!(clock.position(Rate::ntsc(30)).value(), 17_982);
    }

    #[test]
    fn the_engine_rate_is_the_rate_the_render_writes() {
        // Not an assertion about 48000. An assertion that there is one constant
        // rather than two that happen to match today.
        assert_eq!(ENGINE_HZ, makevideo_render::ffmpeg::AUDIO_HZ);
    }
}
