//! The tick, and the two things that drive it.
//!
//! [`Scheduler`] is one step of playback: read the clock, ask [`schedule::step`]
//! what that means for the frame the source is holding, and carry it out. It
//! has no thread of its own and no timer. That is what lets the meter in
//! [`crate::soak`] and the player thread in the app run *the same* timing code
//! rather than two copies that drift apart — which matters more here than
//! anywhere else in this product, because the harness is the only thing that
//! can tell whether the timing is right.
//!
//! Where the frames come from is `makevideo_compositor::source`. Where the time
//! comes from is `makevideo_audio::realtime::Clock`. Neither of them knows about
//! the other, and this is the only place they meet.

use crate::schedule::{step, Step};
use makevideo_audio::realtime::{Clock, ENGINE_HZ};
use makevideo_compositor::source::{Frame, FrameSource, Supply};
use makevideo_render::Rate;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// The longest a tick sleeps while waiting for a frame's turn. Short enough
/// that a seek or a pause is answered inside a frame at any rate the app
/// offers, long enough that the thread is asleep almost all of the time.
pub const MAX_HOLD: Duration = Duration::from_millis(2);

/// How long a tick waits before looking again when there is nothing to do:
/// paused with the still already drawn, or a seek still settling.
pub const IDLE: Duration = Duration::from_millis(4);

/// Something that can put one composited frame on screen.
///
/// It takes the layers rather than a finished picture, so the implementation
/// that draws on a swapchain can composite straight into it. Sending a
/// composited buffer instead would mean reading the frame back off the GPU and
/// uploading it again, which at 1080p30 is the traffic the whole native
/// viewport exists to avoid.
pub trait Sink: Send {
    /// Draw one frame. Called on the driver's thread and on no other.
    fn show(&mut self, frame: &Frame) -> Result<(), String>;

    /// Draw nothing but keep the surface valid — used when the timeline has no
    /// layers at all at this instant, so the monitor goes black rather than
    /// holding a frame from before the gap.
    fn clear(&mut self) -> Result<(), String>;
}

/// What one tick did. The driver paces itself by this and the meter counts it.
#[derive(Debug, Clone, PartialEq)]
pub enum Tick {
    /// A frame reached the screen. `late_ms` is signed: what the clock said
    /// when the drawing was finished, less when the frame was due. Positive is
    /// the picture behind the sound, which is the direction that can happen.
    Presented { frame: i64, late_ms: f64 },
    /// A late frame was thrown away.
    Skipped { frame: i64 },
    /// Not this frame's turn yet. The driver sleeps for `wait`.
    Held { wait: Duration },
    /// The source was jumped forward to the clock.
    Resynced { to: i64 },
    /// Nothing was buffered. Nothing was consumed either, so the next tick asks
    /// for the same instant.
    Starved,
    /// Past the end of the timeline.
    Ended,
    /// Paused with the frame under the playhead already drawn, or waiting for a
    /// seek to settle.
    Idle,
    /// The sink refused. Playback carries on: a frame that could not be drawn
    /// is a frame missing from the screen, not a reason to stop the sound.
    Failed { reason: String },
}

/// Running totals, for the app's own reporting and as a cross-check on the
/// meter. Atomics because the app reads them from the command thread while the
/// player thread writes them.
#[derive(Debug, Default)]
pub struct Counters {
    presented: AtomicU64,
    skipped: AtomicU64,
    resyncs: AtomicU64,
    starved: AtomicU64,
    failures: AtomicU64,
}

impl Counters {
    pub fn presented(&self) -> u64 {
        self.presented.load(Ordering::Relaxed)
    }

    pub fn skipped(&self) -> u64 {
        self.skipped.load(Ordering::Relaxed)
    }

    pub fn resyncs(&self) -> u64 {
        self.resyncs.load(Ordering::Relaxed)
    }

    pub fn starved(&self) -> u64 {
        self.starved.load(Ordering::Relaxed)
    }

    pub fn failures(&self) -> u64 {
        self.failures.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// The scheduler is following the clock.
    Playing,
    /// Nothing follows anything. One frame is drawn at the playhead and then
    /// the surface is left alone.
    Paused,
}

/// Where the audio clock is, as a frame index on the project rate.
///
/// **Floor, not nearest.** Frame *n* is the current frame from the instant it
/// is due until the instant *n+1* is, and rounding to nearest would make it
/// current half a frame early — every frame would then be presented before its
/// time and the picture would sit permanently ahead of the sound by half a
/// frame. `RationalTime::rescaled` rounds, which is right for a playhead
/// somebody reads and wrong for the one thing that decides *now*.
pub fn clock_frame(clock: &Clock, rate: Rate) -> i64 {
    samples_to_frame_floor(clock.position_samples() as i128, rate)
}

fn samples_to_frame_floor(samples: i128, rate: Rate) -> i64 {
    let numerator = samples * i128::from(rate.num());
    let denominator = i128::from(ENGINE_HZ) * i128::from(rate.den());
    if denominator == 0 {
        return 0;
    }
    // Euclidean division, so a negative sample count floors rather than
    // truncating towards zero. The clock cannot go negative today, and a
    // conversion that quietly changes direction at zero is not worth leaving
    // for whoever meets it first.
    numerator.div_euclid(denominator) as i64
}

/// The first engine sample at which `frame` is the current frame.
///
/// **Ceiling, and not `RationalTime::to_samples`.** That one rounds to nearest,
/// which is right for placing a clip in the mix — the mixer wants the closest
/// sample to the true edge — and wrong here, because rounding down puts the
/// due instant a sample *before* the frame really starts, and
/// [`clock_frame`] then floors that back to `frame - 1`. The pair would
/// disagree with itself at rates where a frame is not a whole number of
/// samples, which is every broadcast rate the app offers.
///
/// Rounding up instead makes `clock_frame(frame_due_samples(n)) == n` hold at
/// every rate, which is the property the whole schedule rests on.
fn frame_due_samples(frame: i64, rate: Rate) -> i128 {
    let numerator = i128::from(frame) * i128::from(rate.den()) * i128::from(ENGINE_HZ);
    let denominator = i128::from(rate.num());
    if denominator == 0 {
        return 0;
    }
    numerator.div_euclid(denominator) + i128::from(numerator.rem_euclid(denominator) != 0)
}

fn samples_to_millis(samples: i128) -> f64 {
    samples as f64 * 1000.0 / f64::from(ENGINE_HZ)
}

/// One step of playback, with nothing of its own to run it.
pub struct Scheduler {
    source: FrameSource,
    clock: Arc<Clock>,
    counters: Arc<Counters>,
    rate: Rate,
    resync_after: i64,
    mode: Mode,
    /// A frame that should be on screen while paused and is not there yet.
    still: Option<i64>,
    /// Set while a seek has been asked of the audio engine and not yet
    /// answered. Nothing is judged late during it: the clock is standing still
    /// at the old position and would make every frame look impossibly early,
    /// then impossibly late the moment it moves.
    settling: bool,
    /// The sound has run out, so the clock will never advance again.
    ///
    /// Without this the last frames of a timeline can never be shown. The clock
    /// subtracts the device's latency, so when the final sample has been handed
    /// over it reads a buffer's worth *short* of the end — 512 samples, a third
    /// of a frame at 30 fps, which floors to the frame before the last one. The
    /// picture then waits for an instant that will not arrive, and playback
    /// hangs one frame from the end rather than finishing.
    ///
    /// The soak found it as a three second stall at the end of
    /// `continuous-playback`, with no seek in the run to explain it.
    sound_over: bool,
}

impl Scheduler {
    pub fn new(source: FrameSource, clock: Arc<Clock>, resync_after: i64) -> Scheduler {
        let rate = source.rate();
        Scheduler {
            source,
            clock,
            counters: Arc::new(Counters::default()),
            rate,
            resync_after: resync_after.max(1),
            // Paused with the first frame wanted, so a monitor that has never
            // played still shows the top of the timeline.
            mode: Mode::Paused,
            still: Some(0),
            settling: false,
            sound_over: false,
        }
    }

    pub fn counters(&self) -> &Arc<Counters> {
        &self.counters
    }

    pub fn rate(&self) -> Rate {
        self.rate
    }

    pub fn frames(&self) -> i64 {
        self.source.frames()
    }

    pub fn is_playing(&self) -> bool {
        self.mode == Mode::Playing
    }

    /// Where the picture is. Playing, that is the clock; paused, it is the
    /// frame that was asked for, because the clock is not moving.
    pub fn position(&self) -> i64 {
        match self.mode {
            Mode::Playing => clock_frame(&self.clock, self.rate).clamp(0, self.source.frames()),
            Mode::Paused => self.source.position().clamp(0, self.source.frames()),
        }
    }

    pub fn buffered_bytes(&self) -> usize {
        self.source.buffered_bytes()
    }

    pub fn buffer_ceiling(&self) -> usize {
        self.source.buffer_ceiling()
    }

    /// Start following the clock. The caller starts the sound; this only stops
    /// holding the still.
    pub fn play(&mut self) {
        self.mode = Mode::Playing;
        self.still = None;
    }

    /// Stop following the clock and leave the frame under the playhead on
    /// screen.
    ///
    /// `frame` is where the transport says the playhead stopped, which is the
    /// clock's last word rather than the source's: the source is somewhere
    /// ahead, holding whatever it had buffered.
    pub fn pause(&mut self, frame: i64) {
        self.mode = Mode::Paused;
        self.settling = false;
        self.sound_over = false;
        self.show_still(frame);
    }

    /// Move the picture. Playing or paused takes the same path into the frame
    /// source, which is the source's own rule; what differs is only whether the
    /// result is drawn once or followed.
    ///
    /// `settling` is set for a play seek because the audio engine answers one
    /// asynchronously, and a clock that has not moved yet must not be read as
    /// the picture being early.
    pub fn seek(&mut self, frame: i64) {
        let target = frame.clamp(0, self.source.frames());
        self.sound_over = false;
        match self.mode {
            Mode::Playing => {
                self.source.seek(target);
                self.settling = true;
            }
            Mode::Paused => self.show_still(target),
        }
    }

    /// The audio engine has finished its half of a seek.
    pub fn settled(&mut self) {
        self.settling = false;
    }

    /// Tell the scheduler whether the sound is over.
    ///
    /// Set by whoever can see both the feeder and the ring — the transport —
    /// because the scheduler holds only a clock, and a clock that has stopped
    /// looks exactly like a clock that has not been popped for a moment.
    pub fn set_sound_over(&mut self, over: bool) {
        self.sound_over = over;
    }

    fn show_still(&mut self, frame: i64) {
        let target = frame.clamp(0, self.source.frames());
        self.source.seek(target);
        self.still = Some(target);
    }

    /// One step.
    pub fn tick(&mut self, sink: &mut dyn Sink) -> Tick {
        match self.mode {
            Mode::Paused => self.tick_paused(sink),
            Mode::Playing => self.tick_playing(sink),
        }
    }

    fn tick_paused(&mut self, sink: &mut dyn Sink) -> Tick {
        let Some(target) = self.still else {
            return Tick::Idle;
        };
        match self.source.take() {
            Supply::Ready(frame) => {
                self.still = None;
                self.draw(sink, &frame, None)
            }
            Supply::Starved => {
                self.counters.starved.fetch_add(1, Ordering::Relaxed);
                Tick::Starved
            }
            // Past the end: there is no frame to hold, so the monitor goes
            // black rather than keeping whatever was last drawn.
            Supply::End => {
                self.still = None;
                let _ = target;
                match sink.clear() {
                    Ok(()) => Tick::Ended,
                    Err(reason) => self.fail(reason),
                }
            }
        }
    }

    fn tick_playing(&mut self, sink: &mut dyn Sink) -> Tick {
        if self.settling {
            return Tick::Idle;
        }
        let clock = clock_frame(&self.clock, self.rate);
        let next = self.source.position();
        let decision = step(next, clock, self.resync_after);
        // Holding for a clock that has stopped is waiting for ever. When the
        // sound is over what is left of the picture is due now, so the timeline
        // ends on its last frame rather than one before it.
        let decision = match decision {
            Step::Hold if self.sound_over => Step::Present,
            other => other,
        };
        match decision {
            Step::Hold => Tick::Held {
                wait: self.until_due(next, clock),
            },
            Step::Resync(to) => {
                self.source.seek(to);
                self.counters.resyncs.fetch_add(1, Ordering::Relaxed);
                Tick::Resynced { to }
            }
            Step::Skip => match self.source.take() {
                Supply::Ready(frame) => {
                    self.counters.skipped.fetch_add(1, Ordering::Relaxed);
                    Tick::Skipped { frame: frame.frame }
                }
                Supply::Starved => {
                    self.counters.starved.fetch_add(1, Ordering::Relaxed);
                    Tick::Starved
                }
                Supply::End => Tick::Ended,
            },
            Step::Present => match self.source.take() {
                Supply::Ready(frame) => {
                    let due = frame_due_samples(frame.frame, self.rate);
                    self.draw(sink, &frame, Some(due))
                }
                Supply::Starved => {
                    self.counters.starved.fetch_add(1, Ordering::Relaxed);
                    Tick::Starved
                }
                Supply::End => Tick::Ended,
            },
        }
    }

    /// Draw, then read the clock. That order is the measurement: what is
    /// reported is when the frame *reached* the screen, not when it was picked,
    /// so compositing time counts against the drift the way a viewer sees it.
    fn draw(&mut self, sink: &mut dyn Sink, frame: &Frame, due: Option<i128>) -> Tick {
        if let Err(reason) = sink.show(frame) {
            return self.fail(reason);
        }
        self.counters.presented.fetch_add(1, Ordering::Relaxed);
        let late_ms = due
            .map(|due| samples_to_millis(self.clock.position_samples() as i128 - due))
            .unwrap_or(0.0);
        Tick::Presented {
            frame: frame.frame,
            late_ms,
        }
    }

    fn fail(&self, reason: String) -> Tick {
        self.counters.failures.fetch_add(1, Ordering::Relaxed);
        Tick::Failed { reason }
    }

    /// How long until `next` is due, capped so a command is never waited out.
    fn until_due(&self, next: i64, clock: i64) -> Duration {
        if next <= clock {
            return Duration::ZERO;
        }
        let remaining = frame_due_samples(next, self.rate) - self.clock.position_samples() as i128;
        if remaining <= 0 {
            return Duration::ZERO;
        }
        Duration::from_secs_f64(remaining as f64 / f64::from(ENGINE_HZ)).min(MAX_HOLD)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::DEFAULT_RESYNC;
    use makevideo_compositor::source::{Buffering, FrameReader, Open, Readers};
    use makevideo_render::{
        Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind, FORMAT_VERSION,
    };

    /// Hands back frames instantly, so what a test measures is the scheduler
    /// and never a decoder.
    struct Instant0;

    impl FrameReader for Instant0 {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            buffer.fill(7);
            true
        }
    }

    struct Always;

    impl Readers for Always {
        fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Instant0))
        }
    }

    /// Never opens anything, so every clip is dead and every poll starves.
    struct Never;

    impl Readers for Never {
        fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
            None
        }
    }

    #[derive(Default)]
    struct Recorder {
        shown: Vec<i64>,
        cleared: usize,
    }

    impl Sink for Recorder {
        fn show(&mut self, frame: &Frame) -> Result<(), String> {
            self.shown.push(frame.frame);
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            self.cleared += 1;
            Ok(())
        }
    }

    struct Broken;

    impl Sink for Broken {
        fn show(&mut self, _frame: &Frame) -> Result<(), String> {
            Err("the surface is gone".into())
        }

        fn clear(&mut self) -> Result<(), String> {
            Err("the surface is gone".into())
        }
    }

    /// 300 frames of 30 fps: ten seconds, one clip, one video track.
    fn project() -> Project {
        Project {
            version: FORMAT_VERSION,
            settings: ProjectSettings {
                width: 16,
                height: 16,
                rate: Rate::fps(30),
            },
            assets: vec![Asset {
                id: "a1".into(),
                path: "/m/a1".into(),
                name: "a1".into(),
                kind: AssetKind::Video,
                duration_ms: 10_000,
                width: 16,
                height: 16,
                has_audio: true,
            }],
            tracks: vec![Track {
                id: "V1".into(),
                kind: TrackKind::Video,
                name: "V1".into(),
                clips: vec![Clip {
                    id: "c1".into(),
                    asset_id: "a1".into(),
                    link_group: None,
                    start: 0,
                    in_point: 0,
                    out_point: 300,
                    volume: 1.0,
                    opacity: 1.0,
                }],
                visual_items: Vec::new(),
                muted: false,
                hidden: false,
            }],
            markers: Vec::new(),
        }
    }

    fn scheduler(readers: Arc<dyn Readers>) -> (Scheduler, Arc<Clock>) {
        let clock = Arc::new(Clock::new());
        let source = FrameSource::new(&project(), 16, 16, Buffering::new(6, 15), readers);
        (
            Scheduler::new(source, Arc::clone(&clock), DEFAULT_RESYNC),
            clock,
        )
    }

    /// Put the clock on frame `frame` exactly.
    fn park(clock: &Clock, frame: i64) {
        clock.restart(frame_due_samples(frame, Rate::fps(30)) as u64);
    }

    /// Tick until something other than a starve comes back, so a test is not at
    /// the mercy of a decoder thread that has not been scheduled yet.
    fn settle(scheduler: &mut Scheduler, sink: &mut dyn Sink) -> Tick {
        for _ in 0..2_000 {
            match scheduler.tick(sink) {
                Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
                other => return other,
            }
        }
        panic!("nothing ever arrived");
    }

    #[test]
    fn a_new_scheduler_draws_the_top_of_the_timeline_without_being_played() {
        let (mut scheduler, _clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 0, .. }
        ));
        assert_eq!(sink.shown, vec![0]);
        // And then it stops. A paused monitor redrawing forever is a GPU busy
        // doing nothing.
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        assert_eq!(sink.shown, vec![0]);
    }

    #[test]
    fn a_seek_while_paused_draws_that_frame_and_stops() {
        let (mut scheduler, _clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        scheduler.seek(120);
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 120, .. }
        ));
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        assert_eq!(sink.shown, vec![0, 120]);
        assert_eq!(scheduler.position(), 121);
    }

    /// The rule the issue is about. The clock is ten frames on, the source is
    /// at the start, and what reaches the screen is frame ten — not ten frames
    /// in a row as fast as they can be drawn.
    #[test]
    fn late_frames_are_skipped_and_the_one_the_clock_is_on_is_drawn() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        sink.shown.clear();

        scheduler.play();
        park(&clock, 10);
        let mut presented = None;
        for _ in 0..4_000 {
            match scheduler.tick(&mut sink) {
                Tick::Presented { frame, .. } => {
                    presented = Some(frame);
                    break;
                }
                Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
                _ => {}
            }
        }
        assert_eq!(presented, Some(10));
        assert_eq!(sink.shown, vec![10], "only the current frame is drawn");
        // Nine, not ten: frame 0 was drawn by the still before play started, so
        // the source was already at frame 1 and frames 1 to 9 are what was in
        // the way.
        assert_eq!(scheduler.counters().skipped(), 9);
        assert_eq!(scheduler.counters().resyncs(), 0);
    }

    /// Past the threshold the source jumps instead of walking, and the jump is
    /// forward.
    #[test]
    fn a_long_gap_jumps_the_source_forward() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        scheduler.play();
        park(&clock, 200);
        assert_eq!(scheduler.tick(&mut sink), Tick::Resynced { to: 200 });
        assert_eq!(scheduler.counters().skipped(), 0);
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 200, .. }
        ));
    }

    #[test]
    fn a_frame_whose_turn_has_not_come_holds_without_consuming_anything() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        sink.shown.clear();
        scheduler.play();
        // The source is at frame 1 and the clock has not left frame 0.
        park(&clock, 0);
        for _ in 0..20 {
            assert!(matches!(scheduler.tick(&mut sink), Tick::Held { .. }));
        }
        assert!(sink.shown.is_empty());
        // A hold never waits longer than a command can be left unanswered.
        let Tick::Held { wait } = scheduler.tick(&mut sink) else {
            panic!("expected a hold");
        };
        assert!(wait <= MAX_HOLD, "{wait:?}");
    }

    /// A seek during playback is answered by the audio engine on its own
    /// schedule. Until it is, the clock is still at the old position and the
    /// scheduler must not act on it.
    #[test]
    fn nothing_is_judged_while_a_play_seek_is_settling() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        sink.shown.clear();
        scheduler.play();
        park(&clock, 250);
        scheduler.seek(30);
        for _ in 0..50 {
            assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        }
        assert!(sink.shown.is_empty(), "nothing drawn while settling");
        assert_eq!(scheduler.counters().skipped(), 0, "and nothing skipped");

        park(&clock, 30);
        scheduler.settled();
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 30, .. }
        ));
    }

    #[test]
    fn a_starved_poll_consumes_nothing_and_is_counted() {
        let (mut scheduler, _clock) = scheduler(Arc::new(Never));
        let mut sink = Recorder::default();
        // Every clip is dead, so the frame arrives as a frame with no layers
        // rather than never: a source that cannot be opened leaves a hole and
        // playback runs on. That is the frame source's rule and this only has
        // to not fight it.
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 0, .. }
        ));
    }

    /// A surface that has gone away must not stop the sound. The tick reports
    /// it and the next one carries on.
    #[test]
    fn a_sink_that_refuses_does_not_stop_playback() {
        let (mut scheduler, _clock) = scheduler(Arc::new(Always));
        let mut broken = Broken;
        let mut seen = false;
        for _ in 0..2_000 {
            match scheduler.tick(&mut broken) {
                Tick::Failed { .. } => {
                    seen = true;
                    break;
                }
                Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
                _ => {}
            }
        }
        assert!(seen, "the failure should have been reported");
        assert_eq!(scheduler.counters().failures(), 1);
        // Playing still works: the clock is followed and frames are consumed.
        scheduler.play();
        assert!(!matches!(scheduler.tick(&mut broken), Tick::Idle));
    }

    #[test]
    fn the_clock_floors_rather_than_rounding_to_the_nearest_frame() {
        let rate = Rate::fps(30);
        let clock = Clock::new();
        // Just under half a frame in: still frame 0, and a rounding conversion
        // would already say 1 at 800 samples.
        clock.restart(700);
        assert_eq!(clock_frame(&clock, rate), 0);
        clock.restart(900);
        assert_eq!(clock_frame(&clock, rate), 0);
        clock.restart(1_600);
        assert_eq!(clock_frame(&clock, rate), 1);
        // And exactly on a boundary is the frame that starts there.
        clock.restart(frame_due_samples(7, rate) as u64);
        assert_eq!(clock_frame(&clock, rate), 7);
    }

    /// 29.97 is a ratio and not 29.97, so the conversion has to stay in
    /// integers all the way. Ten thousand frames in, the floor must still land
    /// on ten thousand rather than 9,999.
    #[test]
    fn a_broadcast_rate_lands_on_its_own_frames() {
        let rate = Rate::ntsc(30);
        let clock = Clock::new();
        for frame in [0i64, 1, 999, 1_000, 9_999, 10_000] {
            clock.restart(frame_due_samples(frame, rate) as u64);
            assert_eq!(clock_frame(&clock, rate), frame, "frame {frame}");
        }
    }
}
