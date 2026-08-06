//! The feeder: one thread mixing ahead of the sound, and the seek that empties
//! everything in front of it.
//!
//! This is the thread that does all the work the callback is forbidden to do.
//! It reads the decoder queues, mixes the block, and pushes finished samples
//! into the ring. Everything past this point is arithmetic the callback can
//! afford.
//!
//! # How far ahead to run
//!
//! Not as far as the ring will take. A ring kept brim full is latency: press
//! play and the first thing heard is whatever was mixed a fifth of a second
//! ago, and every seek has to throw all of it away. So the feeder tops up to
//! [`Options::target_fill`] and then sleeps, and the rest of the ring is
//! headroom for the times this thread does not get scheduled when it wanted to.
//!
//! # Seeking
//!
//! Three things in one order, and the order is the point:
//!
//! 1. Ask the ring to flush, and move the source so its decoders start.
//! 2. Push nothing at all until the callback says the flush is done.
//! 3. Then move the clock's origin, and start feeding again.
//!
//! Moving the clock before the flush would count the old position's samples
//! against the new origin, and the position would then read a ring's worth
//! ahead of what is being heard — permanently, because nothing later corrects
//! it.
//!
//! Step 2 has **no deadline**, and that is deliberate. An earlier version gave
//! up after a while and carried on, reasoning that a flush nobody answers means
//! nobody is listening. That is exactly backwards: a consumer that is not
//! running is precisely the state in which the ring is still full of the old
//! position, and pushing there gets the new position's samples thrown away by
//! the flush when it finally lands — leaving the clock permanently ahead of the
//! sound by however much was pushed. Waiting instead costs nothing, because a
//! ring nobody is draining is a ring nobody is hearing.

use crate::mix::total_samples;
use crate::realtime::{Clock, Consumer, Ring, RingView, CHANNELS, ENGINE_HZ};
use crate::source::{Buffering, MixSource, Readers, Supply, BLOCK_FRAMES};
use makevideo_render::{Project, Rate, RationalTime};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender, TryRecvError};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// How much sound the ring holds, in sample frames.
///
/// 8192 frames is 170 ms and 64 KB. Most of it is never used: it is there for
/// the times this process is descheduled, and a buffer only big enough for the
/// good case is a buffer that is not big enough.
pub const RING_FRAMES: usize = 8_192;

/// How much of it the feeder keeps full. 3072 frames is 64 ms, which is the
/// latency that pressing play and finishing a seek pay for.
pub const TARGET_FILL: usize = 3_072;

/// How long the feeder waits on the decoders for one block before giving up on
/// it and looking at its commands again. A block is 21 ms of sound; waiting a
/// second for one would mean a seek during a stall takes a second to answer.
const FEED_DEADLINE: Duration = Duration::from_millis(100);

/// How long the feeder sleeps when the ring is full enough. A quarter of a
/// block: often enough that the ring never runs down between visits, rarely
/// enough that the thread is asleep almost all of the time.
const IDLE: Duration = Duration::from_millis(5);

/// How often the feeder wakes to look for commands while it has nothing to do.
const POLL: Duration = Duration::from_micros(500);

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub ring_frames: usize,
    pub target_fill: usize,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            ring_frames: RING_FRAMES,
            target_fill: TARGET_FILL,
        }
    }
}

/// Counters the feeder keeps, for the soak meter and for a bug report that says
/// the sound broke up.
#[derive(Debug)]
pub struct Feed {
    /// Blocks the decoders could not produce inside [`FEED_DEADLINE`]. Not the
    /// same thing as an underrun: the ring absorbs these, and only a run of
    /// them long enough to drain it is ever heard.
    late_blocks: AtomicU64,
    blocks: AtomicU64,
    /// The least the ring has held since it first filled, which is how much
    /// slack was really left rather than how much was asked for. Before the
    /// first fill it is `usize::MAX`, because a ring that has never been full
    /// has not been low.
    low_water: AtomicUsize,
    primed: AtomicBool,
    ended: AtomicBool,
    /// Seeks the feeder has finished carrying out.
    ///
    /// A seek is a message, not a method call, so for a moment after asking for
    /// one the ring is still full — of the *old* position. Anything that waits
    /// for playback to be ready has to wait for this to catch up first, or it
    /// waits for a buffer that is about to be thrown away.
    seeks_done: AtomicU64,
}

impl Default for Feed {
    fn default() -> Self {
        Feed {
            late_blocks: AtomicU64::new(0),
            blocks: AtomicU64::new(0),
            low_water: AtomicUsize::new(usize::MAX),
            primed: AtomicBool::new(false),
            ended: AtomicBool::new(false),
            seeks_done: AtomicU64::new(0),
        }
    }
}

impl Feed {
    pub fn late_blocks(&self) -> u64 {
        self.late_blocks.load(Ordering::Relaxed)
    }

    pub fn blocks(&self) -> u64 {
        self.blocks.load(Ordering::Relaxed)
    }

    /// `None` until the ring has filled once.
    pub fn low_water(&self) -> Option<usize> {
        match self.low_water.load(Ordering::Relaxed) {
            usize::MAX => None,
            value => Some(value),
        }
    }

    /// The feeder has reached the end of the timeline. What is still in the
    /// ring plays out after that.
    pub fn ended(&self) -> bool {
        self.ended.load(Ordering::Relaxed)
    }

    pub fn seeks_done(&self) -> u64 {
        self.seeks_done.load(Ordering::SeqCst)
    }
}

enum Command {
    Seek(i64),
    Stop,
}

/// The playback audio engine: a mix running ahead of a clock.
///
/// Owns the feeder thread and hands out the other three ends — the ring's
/// consumer for something to play, the clock for the picture to follow, and the
/// counters for the meter. What plays the samples is not decided here: the app
/// gives them to a device and the soak gives them to a thread with a stopwatch,
/// and the engine cannot tell the two apart.
pub struct Engine {
    control: Sender<Command>,
    clock: Arc<Clock>,
    feed: Arc<Feed>,
    ring: RingView,
    rate: Rate,
    total: i64,
    target_fill: usize,
    /// Seeks asked for. Compared against `Feed::seeks_done` to tell whether the
    /// feeder has caught up yet.
    seeks_asked: AtomicU64,
    feeder: Option<JoinHandle<()>>,
}

impl Engine {
    /// Start mixing at the top of the timeline. Nothing is heard until the
    /// consumer is given to something that plays it.
    pub fn start(
        project: &Project,
        buffering: Buffering,
        readers: Arc<dyn Readers>,
        options: Options,
    ) -> (Engine, Consumer, Arc<Clock>) {
        let (producer, consumer) = Ring::new(options.ring_frames);
        let ring = producer.view();
        let clock = Arc::new(Clock::new());
        let feed = Arc::new(Feed::default());
        let (control, commands) = channel();
        let mut source = MixSource::new(project, buffering, readers);
        let target = options.target_fill.clamp(1, producer.capacity() - 1);

        let thread_clock = Arc::clone(&clock);
        let thread_feed = Arc::clone(&feed);
        let feeder = std::thread::spawn(move || {
            let mut block = vec![0.0f32; BLOCK_FRAMES * CHANNELS];
            // A flush that has been asked for and not yet answered, with where
            // the source landed. While this is set, nothing may be pushed.
            let mut awaiting: Option<(u64, i64)> = None;
            thread_clock.restart(0);
            loop {
                match commands.try_recv() {
                    Ok(Command::Stop) | Err(TryRecvError::Disconnected) => break,
                    Ok(Command::Seek(sample)) => {
                        // The flush is asked for first and the source moved
                        // straight after, so the decoders are already refilling
                        // while the callback catches up.
                        let request = producer.request_flush();
                        source.seek(sample);
                        awaiting = Some((request, source.position()));
                        thread_feed.ended.store(false, Ordering::Relaxed);
                        // The ring is about to be empty, so what it held before
                        // the seek is not a low water mark for what comes after.
                        thread_feed.primed.store(false, Ordering::Relaxed);
                        continue;
                    }
                    Err(TryRecvError::Empty) => {}
                }

                if let Some((request, position)) = awaiting {
                    if producer.flushed() < request {
                        std::thread::sleep(POLL);
                        continue;
                    }
                    // The ring is empty and the source is at the target, so the
                    // clock can be moved and feeding can start again. Both of
                    // these are last, so anyone who sees `seeks_done` move can
                    // trust everything above it.
                    thread_clock.restart(position.max(0) as u64);
                    thread_feed.seeks_done.fetch_add(1, Ordering::SeqCst);
                    awaiting = None;
                }

                let filled = producer.filled();
                if filled >= target {
                    thread_feed.primed.store(true, Ordering::Relaxed);
                    // IDLE, not POLL. This is the steady state — the ring is
                    // full enough and there is nothing to do — and it is where
                    // the thread spends almost all of its life. Waking every
                    // 500 us here would be two thousand wakeups a second to
                    // decide each time that there is still nothing to do. A
                    // command waits at most one IDLE to be noticed, which is
                    // 5 ms on a seek and nothing next to the refill it starts.
                    std::thread::sleep(IDLE);
                    continue;
                }
                if producer.free() < BLOCK_FRAMES || thread_feed.ended.load(Ordering::Relaxed) {
                    // Either there is no room for a whole block or there is
                    // nothing left to mix. Both mean waiting for a seek rather
                    // than spinning.
                    std::thread::sleep(IDLE);
                    continue;
                }
                if thread_feed.primed.load(Ordering::Relaxed) {
                    thread_feed.low_water.fetch_min(filled, Ordering::Relaxed);
                }

                let before = source.position();
                match source.take_by(&mut block, Instant::now() + FEED_DEADLINE) {
                    Supply::Ready => {
                        let frames = (source.position() - before).max(0) as usize;
                        // The room was checked above and a block is never
                        // longer than BLOCK_FRAMES, so this always fits. A
                        // short push would drop samples and put the mix out of
                        // step with the clock for the rest of the session,
                        // which is worth an assertion in the debug build.
                        let pushed = producer.push(&block[..frames * CHANNELS]);
                        debug_assert_eq!(pushed, frames, "the ring dropped mixed samples");
                        thread_feed.blocks.fetch_add(1, Ordering::Relaxed);
                    }
                    Supply::Starved => {
                        thread_feed.late_blocks.fetch_add(1, Ordering::Relaxed);
                    }
                    Supply::End => {
                        thread_feed.ended.store(true, Ordering::Relaxed);
                    }
                }
            }
        });

        let engine = Engine {
            control,
            clock: Arc::clone(&clock),
            feed,
            ring,
            rate: project.rate(),
            total: total_samples(project),
            target_fill: target,
            seeks_asked: AtomicU64::new(0),
            feeder: Some(feeder),
        };
        (engine, consumer, clock)
    }

    /// Move playback to a frame of the project rate.
    ///
    /// Returns without waiting for anything, exactly as the frame source's seek
    /// does. What is heard until the refill lands is silence, and the clock
    /// holds at the new position rather than running through it.
    pub fn seek_frame(&self, frame: i64) {
        self.seek_sample(RationalTime::new(frame, self.rate).to_samples(ENGINE_HZ));
    }

    /// Move playback to an engine sample.
    pub fn seek_sample(&self, sample: i64) {
        self.seeks_asked.fetch_add(1, Ordering::SeqCst);
        let _ = self.control.send(Command::Seek(sample.clamp(0, self.total)));
    }

    /// Whether the feeder has carried out every seek asked of it.
    ///
    /// Worth checking before anything that looks at how full the ring is: for a
    /// moment after a seek it is still full of the position that was left, and
    /// a caller that cannot tell the difference concludes playback is ready
    /// when what it is ready with is about to be thrown away.
    ///
    /// **Carrying the seek out needs the consumer to keep running**, because
    /// only the consumer may empty the ring. Whatever is playing must go on
    /// asking for buffers while this is false; a caller that stops to wait
    /// stops the very thing it is waiting for.
    pub fn settled(&self) -> bool {
        self.feed.seeks_done() >= self.seeks_asked.load(Ordering::SeqCst)
    }

    /// Wait until `want` frames are mixed and ready, or until `deadline`.
    /// `false` means it did not get there, which is a decoder too slow to play
    /// with rather than a mistake.
    ///
    /// This is what a play button waits on before anything is playing, and how
    /// long it waits is the startup delay the meter reports. After a seek, use
    /// [`Engine::settled`] from inside whatever is already playing instead —
    /// see the note there.
    pub fn wait_until_ready(&self, want: usize, deadline: Instant) -> bool {
        loop {
            if self.settled() && (self.buffered_frames() >= want || self.feed.ended()) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(POLL);
        }
    }

    /// Sample frames mixed and waiting to be played.
    pub fn buffered_frames(&self) -> usize {
        self.ring.filled()
    }

    /// How full the feeder keeps the ring, which is also what "ready to play"
    /// means. Starting on less than this is starting into a ring that is still
    /// filling, and the first buffers come out short.
    pub fn target_fill(&self) -> usize {
        self.target_fill
    }

    pub fn clock(&self) -> &Arc<Clock> {
        &self.clock
    }

    pub fn feed(&self) -> &Arc<Feed> {
        &self.feed
    }

    /// How long the whole mix is, in engine samples.
    pub fn total_samples(&self) -> i64 {
        self.total
    }

    pub fn rate(&self) -> Rate {
        self.rate
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.control.send(Command::Stop);
        if let Some(feeder) = self.feeder.take() {
            let _ = feeder.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source::tests::{level_readers, one_clip_project};

    fn options() -> Options {
        Options {
            ring_frames: 4_096,
            target_fill: 2_048,
        }
    }

    /// Play everything the engine produces as fast as it appears, the way a
    /// device would if it never had to wait. What is checked here is the
    /// samples and the clock, not the timing; the timing is the soak's job.
    fn drain(consumer: &Consumer, clock: &Clock, out: &mut Vec<f32>, frames: usize) -> usize {
        let mut buffer = vec![0.0f32; frames * CHANNELS];
        let taken = consumer.pop(&mut buffer);
        clock.advance(taken as u64);
        out.extend_from_slice(&buffer[..taken * CHANNELS]);
        taken
    }

    #[test]
    fn the_whole_timeline_comes_out_once_and_the_clock_agrees() {
        // One second of a constant level. The engine has to produce exactly
        // 48000 frames of it and the clock has to end on 48000, because the
        // clock is a count of what was played and not a stopwatch.
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), level_readers(0.5), options());

        let mut played = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(20);
        while (played.len() / CHANNELS) < 48_000 && Instant::now() < deadline {
            if drain(&consumer, &clock, &mut played, 512) == 0 {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
        drop(engine);

        assert_eq!(played.len() / CHANNELS, 48_000);
        assert!(
            played.iter().all(|sample| (*sample - 0.5).abs() < 1e-6),
            "the level should be the clip's own the whole way through"
        );
        assert_eq!(clock.position_samples(), 48_000);
        assert_eq!(clock.underruns(), 0);
    }

    #[test]
    fn the_feeder_stops_at_the_target_instead_of_filling_the_ring() {
        // Latency is what this buys. A ring kept brim full means every seek
        // throws away a fifth of a second of work and every play button waits
        // that long before anything is heard.
        let project = one_clip_project();
        let (engine, _consumer, _clock) =
            Engine::start(&project, Buffering::default(), level_readers(1.0), options());
        assert!(engine.wait_until_ready(2_048, Instant::now() + Duration::from_secs(10)));
        std::thread::sleep(Duration::from_millis(50));
        assert!(
            engine.buffered_frames() < 2_048 + BLOCK_FRAMES,
            "the ring held {} frames against a target of 2048",
            engine.buffered_frames()
        );
    }

    #[test]
    fn a_seek_moves_the_clock_and_what_is_heard_together() {
        // The order the module notes are about. If the clock moved before the
        // ring was flushed, the position here would come back a ring's worth
        // past 24000 and stay wrong for the rest of the session.
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), level_readers(1.0), options());
        assert!(engine.wait_until_ready(2_048, Instant::now() + Duration::from_secs(10)));

        let mut played = Vec::new();
        drain(&consumer, &clock, &mut played, 512);
        engine.seek_sample(24_000);

        // The flush needs a callback to carry it out, which is what this pop
        // is: a device would have done it on its next visit.
        let deadline = Instant::now() + Duration::from_secs(10);
        while clock.position_samples() != 24_000 && Instant::now() < deadline {
            let mut scratch = vec![0.0f32; 512 * CHANNELS];
            consumer.pop(&mut scratch);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(clock.position_samples(), 24_000);

        // And from there the second half plays out and no more.
        let mut rest = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(20);
        while clock.position_samples() < 48_000 && Instant::now() < deadline {
            if drain(&consumer, &clock, &mut rest, 512) == 0 {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
        assert_eq!(clock.position_samples(), 48_000);
        assert_eq!(rest.len() / CHANNELS, 24_000, "exactly what was left");
    }

    #[test]
    fn the_clock_reads_as_a_frame_of_the_project_rate() {
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), level_readers(1.0), options());
        engine.seek_frame(15);
        let deadline = Instant::now() + Duration::from_secs(10);
        while clock.position(engine.rate()).value() != 15 && Instant::now() < deadline {
            let mut scratch = vec![0.0f32; 256 * CHANNELS];
            consumer.pop(&mut scratch);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(clock.position(engine.rate()).value(), 15);
        assert_eq!(clock.position_samples(), 24_000, "half a second");
    }

    #[test]
    fn a_seek_past_the_end_lands_on_the_end_rather_than_running_off_it() {
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), level_readers(1.0), options());
        engine.seek_sample(9_000_000);
        let deadline = Instant::now() + Duration::from_secs(10);
        while clock.position_samples() != 48_000 && Instant::now() < deadline {
            let mut scratch = vec![0.0f32; 256 * CHANNELS];
            consumer.pop(&mut scratch);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(clock.position_samples(), 48_000);
        assert_eq!(engine.total_samples(), 48_000);
    }

    #[test]
    fn a_seek_pushes_nothing_until_the_ring_has_really_been_flushed() {
        // Only the consumer can empty the ring, so while nothing is popping a
        // seek cannot complete. A feeder that gave up waiting and pushed anyway
        // would have those samples thrown away by the flush when it finally
        // landed, while the clock had already been moved to the new position —
        // a clock permanently ahead of the sound, with nothing to correct it.
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), level_readers(1.0), options());
        assert!(engine.wait_until_ready(2_048, Instant::now() + Duration::from_secs(10)));
        let before = engine.buffered_frames();

        engine.seek_sample(24_000);
        // Long enough that any deadline-and-carry-on would have fired.
        std::thread::sleep(Duration::from_millis(400));
        assert!(
            !engine.settled(),
            "the seek cannot be finished while nothing is popping"
        );
        assert_eq!(clock.position_samples(), 0, "so the clock has not moved");
        assert!(
            engine.buffered_frames() <= before,
            "and nothing was pushed on top of the stale ring: {} against {before}",
            engine.buffered_frames()
        );

        // Now play it out. What is heard has to be exactly the second half.
        let mut played = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(20);
        while clock.position_samples() < 48_000 && Instant::now() < deadline {
            if drain(&consumer, &clock, &mut played, 512) == 0 {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
        assert_eq!(clock.position_samples(), 48_000);
        assert_eq!(
            played.len() / CHANNELS,
            24_000,
            "the samples heard and the clock agree on where the seek landed"
        );
    }

    #[test]
    fn dropping_the_engine_stops_the_feeder_rather_than_leaking_it() {
        let project = one_clip_project();
        let (done, finished) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let (engine, _consumer, _clock) =
                Engine::start(&project, Buffering::default(), level_readers(1.0), options());
            drop(engine);
            let _ = done.send(());
        });
        assert!(finished.recv_timeout(Duration::from_secs(5)).is_ok());
    }
}
