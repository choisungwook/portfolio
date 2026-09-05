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
    /// `present_ms` is the elapsed time spent in the sink's `show` call.
    Presented {
        frame: i64,
        late_ms: f64,
        present_ms: f64,
    },
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

enum PendingDisplay {
    PausedFrame(Frame),
    ExactFrame { frame: Frame, due: i128 },
    Clear,
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
    /// The exact frame requested or last shown while paused. `FrameSource`
    /// points at the next frame after a successful take, so it cannot be used
    /// as the visible paused position or as the target of a same-frame redraw.
    paused_at: i64,
    /// The pixels last shown while paused. Guide-only redraws reuse them, so
    /// changing an editor overlay never seeks or reopens a decoder.
    paused_frame: Option<Frame>,
    /// Set while a seek has been asked of the audio engine and not yet
    /// answered. Nothing is judged late during it: the clock is standing still
    /// at the old position and would make every frame look impossibly early,
    /// then impossibly late the moment it moves.
    settling: bool,
    /// The logical seek target remains exact while an earlier neighbor may be
    /// shown temporarily. Cleared only when that exact frame is consumed.
    seeking_exact: Option<i64>,
    /// A playing seek cannot leave an unrelated old frame on screen while
    /// audio and decoding settle. Cleared before any retained or new frame is
    /// allowed to reach the sink.
    clear_before_seek: bool,
    /// A fully decoded frame whose sink had no drawable. Keeping its pixels
    /// avoids reopening ffmpeg on every timeout and lets an occluded candidate
    /// commit internally, then present this same frame when the view returns.
    pending_display: Option<PendingDisplay>,
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
            paused_at: 0,
            paused_frame: None,
            settling: false,
            seeking_exact: None,
            clear_before_seek: false,
            pending_display: None,
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

    pub fn required_exact(&self) -> Option<i64> {
        self.seeking_exact
    }

    /// Where the picture is. Playing, that is the clock; paused, it is the
    /// frame that was asked for, because the clock is not moving.
    pub fn position(&self) -> i64 {
        match self.mode {
            Mode::Playing => clock_frame(&self.clock, self.rate).clamp(0, self.source.frames()),
            Mode::Paused => self.paused_at,
        }
    }

    pub fn buffered_bytes(&self) -> usize {
        self.source.buffered_bytes()
            + self
                .paused_frame
                .as_ref()
                .map(frame_bytes)
                .unwrap_or_default()
            + self
                .pending_display
                .as_ref()
                .map(pending_display_bytes)
                .unwrap_or_default()
    }

    pub fn buffer_ceiling(&self) -> usize {
        self.source.buffer_ceiling() + self.source.frame_ceiling()
    }

    /// Start following the clock. The caller starts the sound; this only stops
    /// holding the still.
    pub fn play(&mut self) {
        self.source.resume_decoders();
        self.mode = Mode::Playing;
        // A paused seek may still be decoding its exact frame. Playing does
        // not cancel that user request: keep T exact once, then catch up to
        // the audio clock. A frame already waiting on the sink is promoted by
        // the branch below; `still` is the not-yet-decoded half of the same
        // promise.
        let waiting_still = self.still.take();
        self.paused_frame = None;
        match self.pending_display.take() {
            Some(PendingDisplay::PausedFrame(frame)) => {
                let due = frame_due_samples(frame.frame, self.rate);
                self.seeking_exact = Some(frame.frame);
                self.pending_display = Some(PendingDisplay::ExactFrame { frame, due });
            }
            pending => self.pending_display = pending,
        }
        if self.seeking_exact.is_none() {
            self.seeking_exact = waiting_still;
        }
        if self.seeking_exact.is_some() {
            self.clear_before_seek = true;
        }
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
        self.seeking_exact = None;
        self.clear_before_seek = false;
        self.pending_display = None;
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
        self.pending_display = None;
        match self.mode {
            Mode::Playing => {
                self.source.seek(target);
                self.seeking_exact = Some(target);
                self.settling = true;
                // The old visible frame may be anywhere on the timeline. It
                // is not a valid seek neighbor, so remove it before waiting
                // for current-generation T-2, T-1 or exact T.
                self.clear_before_seek = true;
            }
            Mode::Paused => self.show_still(target),
        }
    }

    /// The audio engine has finished its half of a seek.
    pub fn settled(&mut self) {
        self.settling = false;
    }

    /// Keep a playing scheduler from judging frames against a clock whose
    /// asynchronous seek has not landed yet.
    pub fn wait_for_settle(&mut self) {
        self.settling = true;
    }

    /// Align a replacement path to the current audio clock without promising
    /// to display the now-stale starting frame. User seeks use [`Self::seek`]
    /// and retain their exact-frame guarantee.
    pub fn align_playback(&mut self, frame: i64) {
        let target = frame.clamp(0, self.source.frames());
        self.sound_over = false;
        self.pending_display = None;
        self.seeking_exact = None;
        self.clear_before_seek = false;
        self.settling = false;
        self.source.seek(target);
    }

    pub fn redraw(&mut self) {
        if self.mode != Mode::Paused || self.pending_display.is_some() {
            return;
        }
        if let Some(frame) = self.paused_frame.take() {
            self.pending_display = Some(PendingDisplay::PausedFrame(frame));
            self.still = None;
        } else {
            self.show_still(self.paused_at);
        }
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
        self.paused_at = target;
        self.paused_frame = None;
        self.source.seek_exact(target);
        self.still = Some(target);
    }

    /// One step.
    pub fn tick(&mut self, sink: &mut dyn Sink) -> Tick {
        self.source.maintain_decoders();
        if self.clear_before_seek {
            return self.clear_seek_surface(sink);
        }
        if self.pending_display.is_some() {
            return self.retry_pending_display(sink);
        }
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
                let tick = self.draw(sink, &frame, None);
                if present_waiting(&tick) {
                    self.pending_display = Some(PendingDisplay::PausedFrame(frame));
                    self.still = None;
                    // The decoded pixels are retained for the surface retry,
                    // so no decoder needs to stay hot while the window is
                    // hidden or temporarily unable to present.
                    self.source.idle_decoders();
                } else {
                    self.paused_frame = Some(frame);
                    self.still = None;
                    self.source.idle_decoders();
                }
                tick
            }
            Supply::Starved => {
                self.counters.starved.fetch_add(1, Ordering::Relaxed);
                Tick::Starved
            }
            // Past the end: there is no frame to hold, so the monitor goes
            // black rather than keeping whatever was last drawn.
            Supply::End => match sink.clear() {
                Ok(()) => {
                    self.still = None;
                    Tick::Ended
                }
                Err(reason) => {
                    let tick = self.sink_failure(reason);
                    if present_waiting(&tick) {
                        self.pending_display = Some(PendingDisplay::Clear);
                        self.still = None;
                    } else {
                        self.still = None;
                    }
                    let _ = target;
                    tick
                }
            },
        }
    }

    fn tick_playing(&mut self, sink: &mut dyn Sink) -> Tick {
        if self.settling {
            return Tick::Idle;
        }
        let clock = clock_frame(&self.clock, self.rate);
        let next = self.source.position();
        // A seek neighbor is only a temporary picture. The requested exact
        // frame must reach the sink once even if decode time lets the audio
        // clock move past the ordinary resync threshold in the meantime.
        let decision = if self.seeking_exact.is_some() {
            Step::Present
        } else {
            step(next, clock, self.resync_after)
        };
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
                    if self.seeking_exact == Some(frame.frame) {
                        let due = frame_due_samples(frame.frame, self.rate);
                        let tick = self.draw(sink, &frame, Some(due));
                        if present_waiting(&tick) {
                            self.pending_display = Some(PendingDisplay::ExactFrame { frame, due });
                        } else {
                            self.seeking_exact = None;
                        }
                        return tick;
                    }
                    self.counters.skipped.fetch_add(1, Ordering::Relaxed);
                    Tick::Skipped { frame: frame.frame }
                }
                Supply::Starved => self.starved_or_neighbor(sink),
                Supply::End => Tick::Ended,
            },
            Step::Present => match self.source.take() {
                Supply::Ready(frame) => {
                    if self.seeking_exact == Some(frame.frame) {
                        let due = frame_due_samples(frame.frame, self.rate);
                        let tick = self.draw(sink, &frame, Some(due));
                        if present_waiting(&tick) {
                            self.pending_display = Some(PendingDisplay::ExactFrame { frame, due });
                        } else {
                            self.seeking_exact = None;
                        }
                        return tick;
                    }
                    let due = frame_due_samples(frame.frame, self.rate);
                    self.draw(sink, &frame, Some(due))
                }
                Supply::Starved => self.starved_or_neighbor(sink),
                Supply::End => Tick::Ended,
            },
        }
    }

    fn starved_or_neighbor(&mut self, sink: &mut dyn Sink) -> Tick {
        self.counters.starved.fetch_add(1, Ordering::Relaxed);
        let Some(target) = self.seeking_exact else {
            return Tick::Starved;
        };
        let Some(frame) = self
            .source
            .take_neighbor_before(target, makevideo_compositor::source::SEEK_NEIGHBOR_FRAMES)
        else {
            return Tick::Starved;
        };
        let due = frame_due_samples(frame.frame, self.rate);
        self.draw(sink, &frame, Some(due))
    }

    fn retry_pending_display(&mut self, sink: &mut dyn Sink) -> Tick {
        let pending = self
            .pending_display
            .take()
            .expect("pending display was checked before retry");
        match pending {
            PendingDisplay::PausedFrame(frame) => {
                let tick = self.draw(sink, &frame, None);
                if present_waiting(&tick) {
                    self.pending_display = Some(PendingDisplay::PausedFrame(frame));
                } else {
                    self.paused_frame = Some(frame);
                    self.still = None;
                    self.source.idle_decoders();
                }
                tick
            }
            PendingDisplay::ExactFrame { frame, due } => {
                let tick = self.draw(sink, &frame, Some(due));
                if present_waiting(&tick) {
                    self.pending_display = Some(PendingDisplay::ExactFrame { frame, due });
                } else {
                    self.seeking_exact = None;
                }
                tick
            }
            PendingDisplay::Clear => match sink.clear() {
                Ok(()) => Tick::Ended,
                Err(reason) => {
                    let tick = self.sink_failure(reason);
                    if present_waiting(&tick) {
                        self.pending_display = Some(PendingDisplay::Clear);
                    }
                    tick
                }
            },
        }
    }

    fn clear_seek_surface(&mut self, sink: &mut dyn Sink) -> Tick {
        match sink.clear() {
            Ok(()) => {
                self.clear_before_seek = false;
                Tick::Idle
            }
            Err(reason) => {
                let tick = self.sink_failure(reason);
                if !present_waiting(&tick) {
                    self.clear_before_seek = false;
                }
                tick
            }
        }
    }

    /// Draw, then read the clock. That order is the measurement: what is
    /// reported is when the frame *reached* the screen, not when it was picked,
    /// so compositing time counts against the drift the way a viewer sees it.
    fn draw(&mut self, sink: &mut dyn Sink, frame: &Frame, due: Option<i128>) -> Tick {
        let started = std::time::Instant::now();
        if let Err(reason) = sink.show(frame) {
            return self.sink_failure(reason);
        }
        self.counters.presented.fetch_add(1, Ordering::Relaxed);
        let present_ms = started.elapsed().as_secs_f64() * 1000.0;
        let late_ms = due
            .map(|due| samples_to_millis(self.clock.position_samples() as i128 - due))
            .unwrap_or(0.0);
        Tick::Presented {
            frame: frame.frame,
            late_ms,
            present_ms,
        }
    }

    fn fail(&self, reason: String) -> Tick {
        self.counters.failures.fetch_add(1, Ordering::Relaxed);
        Tick::Failed { reason }
    }

    fn sink_failure(&self, reason: String) -> Tick {
        if reason == crate::transport::PRESENT_DEFERRED
            || reason == crate::transport::PRESENT_HIDDEN
        {
            Tick::Failed { reason }
        } else {
            self.fail(reason)
        }
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

fn present_waiting(tick: &Tick) -> bool {
    matches!(
        tick,
        Tick::Failed { reason }
            if reason == crate::transport::PRESENT_DEFERRED
                || reason == crate::transport::PRESENT_HIDDEN
    )
}

fn pending_display_bytes(pending: &PendingDisplay) -> usize {
    let frame = match pending {
        PendingDisplay::PausedFrame(frame) | PendingDisplay::ExactFrame { frame, .. } => frame,
        PendingDisplay::Clear => return 0,
    };
    frame_bytes(frame)
}

fn frame_bytes(frame: &Frame) -> usize {
    frame
        .layers
        .iter()
        .map(|layer| layer.pixels.len())
        .sum::<usize>()
        + frame
            .visuals
            .iter()
            .map(|layer| layer.pixels.len())
            .sum::<usize>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::DEFAULT_RESYNC;
    use makevideo_compositor::source::{Buffering, CancelRead, FrameReader, Open, Readers};
    use makevideo_render::{
        Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind, FORMAT_VERSION,
    };
    use std::sync::atomic::AtomicUsize;
    use std::sync::{Condvar, Mutex};

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

    struct CountingReaders(Arc<AtomicUsize>);

    impl Readers for CountingReaders {
        fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
            self.0.fetch_add(1, Ordering::Relaxed);
            Some(Box::new(Instant0))
        }
    }

    #[derive(Default)]
    struct GateState {
        through: i64,
        cancelled: bool,
    }

    #[derive(Default)]
    struct Gate {
        state: Mutex<GateState>,
        wake: Condvar,
    }

    impl Gate {
        fn allow(&self, through: i64) {
            let mut state = self.state.lock().unwrap();
            state.through = state.through.max(through);
            self.wake.notify_all();
        }

        fn cancel(&self) {
            self.state.lock().unwrap().cancelled = true;
            self.wake.notify_all();
        }
    }

    struct GatedReader {
        next: i64,
        remaining: i64,
        gate: Arc<Gate>,
    }

    impl FrameReader for GatedReader {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            if self.remaining <= 0 {
                return false;
            }
            let mut state = self.gate.state.lock().unwrap();
            while self.next > state.through && !state.cancelled {
                state = self.gate.wake.wait(state).unwrap();
            }
            if state.cancelled {
                return false;
            }
            drop(state);
            buffer.fill(self.next as u8);
            self.next += 1;
            self.remaining -= 1;
            true
        }

        fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
            Some(Arc::new(GateCancel(Arc::clone(&self.gate))))
        }
    }

    struct GateCancel(Arc<Gate>);

    impl CancelRead for GateCancel {
        fn cancel(&self) {
            self.0.cancel();
        }
    }

    struct GatedReaders(Arc<Gate>);

    impl Readers for GatedReaders {
        fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(GatedReader {
                next: request.in_frame,
                remaining: request.frames,
                gate: Arc::clone(&self.0),
            }))
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

    struct DeferExactOnce {
        exact: i64,
        deferred: bool,
        shown: Vec<i64>,
    }

    impl Sink for DeferExactOnce {
        fn show(&mut self, frame: &Frame) -> Result<(), String> {
            if frame.frame == self.exact && !self.deferred {
                self.deferred = true;
                return Err(crate::transport::PRESENT_DEFERRED.into());
            }
            self.shown.push(frame.frame);
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            Ok(())
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
                    lut_path: None,
                    start: 0,
                    in_point: 0,
                    out_point: 300,
                    volume: 1.0,
                    opacity: 1.0,
                    speed: 1.0,
                    preserve_pitch: true,
                    fade_in: 0,
                    fade_out: 0,
                    volume_keyframes: Default::default(),
                    blend_mode: Default::default(),
                }],
                visual_items: Vec::new(),
                muted: false,
                hidden: false,
                subtitle_style: None,
            }],
            transitions: Vec::new(),
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
        assert_eq!(scheduler.position(), 120);

        scheduler.seek(scheduler.position());
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 120, .. }
        ));
        assert_eq!(sink.shown, vec![0, 120, 120]);
        assert_eq!(scheduler.position(), 120);
    }

    #[test]
    fn a_playing_seek_clears_the_unrelated_old_picture_before_waiting() {
        let gate = Arc::new(Gate::default());
        let (mut scheduler, _clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        assert_eq!(sink.shown, vec![0]);

        scheduler.play();
        scheduler.seek(20);
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        assert_eq!(sink.cleared, 1);
        assert_eq!(sink.shown, vec![0]);
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        assert_eq!(sink.cleared, 1, "the seek clear happens exactly once");
    }

    #[test]
    fn paused_redraw_reuses_the_visible_pixels_without_reopening_a_decoder() {
        let opens = Arc::new(AtomicUsize::new(0));
        let (mut scheduler, _clock) = scheduler(Arc::new(CountingReaders(Arc::clone(&opens))));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        let opened = opens.load(Ordering::Relaxed);

        scheduler.redraw();
        assert!(matches!(
            scheduler.tick(&mut sink),
            Tick::Presented { frame: 0, .. }
        ));
        assert_eq!(opens.load(Ordering::Relaxed), opened);
        assert_eq!(sink.shown, vec![0, 0]);
    }

    #[test]
    fn a_paused_seek_waits_for_the_exact_frame_without_showing_a_neighbor() {
        let gate = Arc::new(Gate::default());
        let (mut scheduler, _clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        sink.shown.clear();

        scheduler.seek(20);
        gate.allow(19);
        for _ in 0..50 {
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(
            sink.shown.is_empty(),
            "no earlier frame may be shown paused"
        );
        gate.allow(20);
        assert!(matches!(
            settle(&mut scheduler, &mut sink),
            Tick::Presented { frame: 20, .. }
        ));
        assert_eq!(sink.shown, vec![20]);
    }

    #[test]
    fn play_keeps_a_paused_exact_frame_that_waited_for_a_drawable() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut initial = Recorder::default();
        settle(&mut scheduler, &mut initial);
        scheduler.seek(20);

        let mut sink = DeferExactOnce {
            exact: 20,
            deferred: false,
            shown: Vec::new(),
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let tick = scheduler.tick(&mut sink);
            if matches!(
                tick,
                Tick::Failed { ref reason }
                    if reason == crate::transport::PRESENT_DEFERRED
            ) {
                break;
            }
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(
            scheduler.source.decoder_lifecycle(),
            makevideo_compositor::source::DecoderLifecycle::Idle,
            "retained pixels let a hidden paused surface idle its decoder"
        );
        assert_eq!(
            scheduler.buffer_ceiling(),
            scheduler.source.buffer_ceiling() + scheduler.source.frame_ceiling()
        );
        assert!(scheduler.buffered_bytes() <= scheduler.buffer_ceiling());

        scheduler.play();
        park(&clock, 20);
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
        assert!(matches!(
            scheduler.tick(&mut sink),
            Tick::Presented { frame: 20, .. }
        ));
        assert_eq!(sink.shown, vec![20]);
        assert_eq!(scheduler.counters.failures.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn play_keeps_a_paused_exact_frame_that_is_still_decoding() {
        let gate = Arc::new(Gate::default());
        let (mut scheduler, clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
        let mut initial = Recorder::default();
        settle(&mut scheduler, &mut initial);
        let mut sink = Recorder::default();

        scheduler.seek(20);
        scheduler.play();
        park(&clock, 35);
        scheduler.settled();
        assert_eq!(scheduler.required_exact(), Some(20));

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        for _ in 0..50 {
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(sink.shown.is_empty(), "paused exact seek has no neighbor");

        gate.allow(20);
        while !sink.shown.contains(&20) {
            assert!(
                std::time::Instant::now() < deadline,
                "exact frame was cancelled by play"
            );
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown, vec![20]);
    }

    #[test]
    fn a_seek_neighbor_is_replaced_by_exact_even_after_the_clock_advances() {
        let gate = Arc::new(Gate::default());
        let (mut scheduler, clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
        let mut sink = Recorder::default();
        settle(&mut scheduler, &mut sink);
        sink.shown.clear();

        scheduler.play();
        scheduler.seek(20);
        park(&clock, 20);
        scheduler.settled();
        gate.allow(18);

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while sink.shown.is_empty() {
            assert!(std::time::Instant::now() < deadline, "no neighbor arrived");
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown, vec![18]);

        // The target is now late. It must still replace the temporary
        // neighbor once, before ordinary skip-late catch-up resumes.
        park(&clock, 36);
        gate.allow(20);
        while !sink.shown.contains(&20) {
            assert!(
                std::time::Instant::now() < deadline,
                "exact frame was skipped"
            );
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown, vec![18, 20]);

        gate.allow(36);
        while !sink.shown.contains(&36) {
            assert!(
                std::time::Instant::now() < deadline,
                "clock frame did not arrive"
            );
            scheduler.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown.last(), Some(&36));
        assert!(
            !(21..36).any(|frame| sink.shown.contains(&frame)),
            "frames between exact 20 and clock 36 are skipped"
        );
    }

    #[test]
    fn a_transient_timeout_retries_exact_before_resyncing_to_a_far_clock() {
        let (mut scheduler, clock) = scheduler(Arc::new(Always));
        let mut initial = Recorder::default();
        settle(&mut scheduler, &mut initial);
        scheduler.play();
        scheduler.seek(20);
        park(&clock, 35);
        scheduler.settled();

        let mut sink = DeferExactOnce {
            exact: 20,
            deferred: false,
            shown: Vec::new(),
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let tick = scheduler.tick(&mut sink);
            if matches!(
                tick,
                Tick::Failed { ref reason }
                    if reason == crate::transport::PRESENT_DEFERRED
            ) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "exact frame was never tried"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(scheduler.seeking_exact, Some(20));
        assert!(!sink.shown.contains(&20));

        while !sink.shown.contains(&20) {
            scheduler.tick(&mut sink);
            assert!(
                std::time::Instant::now() < deadline,
                "exact frame was not retried after timeout"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(scheduler.seeking_exact, None);
        assert_eq!(scheduler.counters.failures.load(Ordering::Relaxed), 0);

        let clock_frame = clock_frame(&clock, Rate::fps(30));
        while !sink.shown.contains(&clock_frame) {
            scheduler.tick(&mut sink);
            assert!(
                std::time::Instant::now() < deadline,
                "playback did not catch up after the exact frame"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(
            !(21..clock_frame).any(|frame| sink.shown.contains(&frame)),
            "catch-up frames must be skipped, not presented"
        );
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
