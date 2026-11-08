//! Play, pause and seek, over both halves at once.
//!
//! The audio engine and the frame source each already know how to seek. What
//! they do not know is that they are two halves of one playhead, and every way
//! of getting that wrong looks the same on screen. So the ordering lives here,
//! once, rather than in the app and again in the meter.
//!
//! The device is not here. `Engine::start` hands back a `Consumer` and whoever
//! builds a transport gives it to something that plays it: cpal in the app, a
//! thread with a stopwatch in the soak. That is the same split the audio crate
//! already made, and it is why the timing can be measured on a machine with no
//! sound card and no window.

use crate::player::{Scheduler, Sink, Tick};
use makevideo_audio::engine::{Engine as AudioEngine, Options as AudioOptions};
use makevideo_audio::realtime::{Consumer, ENGINE_HZ};
use makevideo_audio::source::{Buffering as AudioBuffering, Readers as AudioReaders};
use makevideo_compositor::source::{
    Buffering as FrameBuffering, FrameSource, Readers as FrameReaders,
};
use makevideo_render::{Project, RationalTime};
use std::sync::Arc;

/// A sink call completed without a swapchain image actually reaching the
/// display (for example while the window is occluded). Candidate replacement
/// treats this as retryable readiness, not a commit or an explicit failure.
pub const PRESENT_DEFERRED: &str = "the monitor did not present a drawable yet";
pub const PRESENT_HIDDEN: &str = "the monitor is hidden until its view becomes visible";

/// Everything needed to start playing a timeline.
pub struct Setup<'a> {
    pub project: &'a Project,
    /// The output frame the compositor draws. Usually the project size; the
    /// monitor's own size on screen is the surface's business, not this.
    pub width: u32,
    pub height: u32,
    pub frame_buffering: FrameBuffering,
    pub frame_readers: Arc<dyn FrameReaders>,
    pub audio_buffering: AudioBuffering,
    pub audio_readers: Arc<dyn AudioReaders>,
    pub audio: AudioOptions,
    /// How far behind the clock the picture may fall before it jumps. See
    /// [`crate::schedule::DEFAULT_RESYNC`].
    pub resync_after: i64,
}

/// The video-only half of a replacement playback path.
///
/// Audio deliberately is not here. A replacement follows the clock already
/// owned by [`Transport`], so changing preview quality, proxies or the
/// compositor cannot reopen the output device or move the audible playhead.
pub struct VideoSetup<'a> {
    pub project: &'a Project,
    pub width: u32,
    pub height: u32,
    pub frame_buffering: FrameBuffering,
    pub frame_readers: Arc<dyn FrameReaders>,
    pub resync_after: i64,
}

/// What trying the video-only replacement did on this tick.
#[derive(Debug, Clone, PartialEq)]
pub enum VideoReplacement {
    /// It has not presented a frame yet, so the old scheduler remains active.
    Pending,
    /// Its first frame reached the candidate sink and it is now the active
    /// scheduler. The tick is returned so the driver can account for it.
    Committed(Tick),
    /// The candidate sink refused the frame. It has been discarded and the
    /// old scheduler is still active.
    Failed(String),
}

/// The two halves of playback, moved together.
pub struct Transport {
    audio: AudioEngine,
    scheduler: Scheduler,
    /// A video path warming against the same audio clock. It cannot replace
    /// `scheduler` until one of its frames has actually reached its sink.
    candidate: Option<Scheduler>,
    /// Seeks asked of the audio engine since it started. **Never reset**, because
    /// `Feed::seeks_done` is not reset either and the two are only comparable
    /// as running totals.
    ///
    /// Zeroing this after a seek settled is a bug that hides completely at one
    /// seek and stalls playback at the second: the engine's total is already
    /// past the new count, so the next seek is called settled the instant it is
    /// asked. The scheduler then reads a clock still sitting at the old
    /// position, decides the picture is a long way behind, and jumps the source
    /// forward — to a place the clock is about to leave, at which point the
    /// picture waits for a moment that has already gone. The soak found this as
    /// a three second stall in `repeated-seek`.
    asked: u64,
    /// A seek has been asked for and not yet answered.
    waiting: bool,
    /// The frame the audio engine is moving to while `waiting` is true.
    /// `Scheduler::position()` still reads the old audio clock during that
    /// window, so a replacement must align to this value instead.
    waiting_target: Option<i64>,
    /// The scheduler has exhausted the timeline. The audio clock can still
    /// floor to the last frame, so position alone cannot identify replay.
    ended: bool,
}

impl Transport {
    /// Builds both halves. Nothing is heard until the returned [`Consumer`] is
    /// given to something that plays it, and nothing is seen until [`tick`] is
    /// called with a sink.
    ///
    /// [`tick`]: Transport::tick
    pub fn start(setup: Setup<'_>) -> (Transport, Consumer) {
        let (audio, consumer, clock) = AudioEngine::start(
            setup.project,
            setup.audio_buffering,
            setup.audio_readers,
            setup.audio,
        );
        let source = FrameSource::new(
            setup.project,
            setup.width,
            setup.height,
            setup.frame_buffering,
            setup.frame_readers,
        );
        let scheduler = Scheduler::new(source, clock, setup.resync_after);
        (
            Transport {
                audio,
                scheduler,
                candidate: None,
                asked: 0,
                waiting: false,
                waiting_target: None,
                ended: false,
            },
            consumer,
        )
    }

    pub fn scheduler(&self) -> &Scheduler {
        &self.scheduler
    }

    pub fn video_buffered_bytes(&self) -> usize {
        self.scheduler.buffered_bytes().saturating_add(
            self.candidate
                .as_ref()
                .map(Scheduler::buffered_bytes)
                .unwrap_or_default(),
        )
    }

    pub fn video_buffer_ceiling(&self) -> usize {
        self.scheduler.buffer_ceiling().saturating_add(
            self.candidate
                .as_ref()
                .map(Scheduler::buffer_ceiling)
                .unwrap_or_default(),
        )
    }

    pub fn audio(&self) -> &AudioEngine {
        &self.audio
    }

    pub fn is_playing(&self) -> bool {
        self.scheduler.is_playing()
    }

    /// Whether the device may expose the ring without playing samples from the
    /// position a seek just left. A completed flush alone is not enough: wait
    /// until the new position has a normal buffer (or genuinely reached end).
    pub fn audio_ready(&self) -> bool {
        !self.waiting
            && (self.audio.buffered_frames() >= self.audio.target_fill()
                || self.audio.feed().ended())
    }

    /// Where the playhead is, in frames of the project rate.
    pub fn position(&self) -> i64 {
        // The audio clock still reports the old frame until its asynchronous
        // seek flush completes. During that window the user-visible playhead
        // is the requested target, not the clock being left behind.
        self.waiting_target
            .unwrap_or_else(|| self.scheduler.position())
    }

    pub fn frames(&self) -> i64 {
        self.scheduler.frames()
    }

    /// Start following the clock.
    ///
    /// The sound is already running — the feeder has been mixing since
    /// [`Transport::start`] and the device has been popping — so this is only
    /// the picture being told to stop holding its still. Waiting here for the
    /// ring to fill would be the transport waiting for the consumer, and the
    /// consumer is somebody else's thread.
    pub fn play(&mut self) {
        // Play after the timeline ended means replay, not another immediate
        // Ended tick. Use the ordinary seek handshake so sound, clock and the
        // exact first picture all restart together.
        if self.ended || self.scheduler.position() >= self.scheduler.frames() {
            self.seek(0);
        }
        self.scheduler.play();
        if self.waiting {
            self.scheduler.wait_for_settle();
        }
        if let Some(candidate) = self.candidate.as_mut() {
            candidate.play();
            if self.waiting {
                candidate.wait_for_settle();
            }
        }
    }

    /// Stop, and leave the frame the playhead landed on drawn.
    pub fn pause(&mut self) {
        // The audio seek completes asynchronously, so its clock may still be
        // at the old frame. Pausing does not cancel the user's target: keep T
        // as the exact paused still until the audio half settles.
        let waiting_audio = self.waiting_target;
        let pending_exact = self.scheduler.required_exact();
        let at = waiting_audio
            .or(pending_exact)
            .unwrap_or_else(|| self.scheduler.position());
        self.scheduler.pause(at);
        if let Some(candidate) = self.candidate.as_mut() {
            candidate.pause(at);
        }
        // Audio may already have settled and advanced while exact T is still
        // decoding. If T is what pause preserves, move the sound back to the
        // same point instead of resuming later from T+n.
        if waiting_audio.is_none() && pending_exact.is_some() {
            self.seek_audio(at);
        }
    }

    /// Move both halves to `frame`.
    ///
    /// The audio is moved by **sample**, converted from the frame here, because
    /// that is the unit the mixer places clips in. Handing the engine a frame
    /// index and letting it convert would round the target by up to half a
    /// frame — 16.7 ms at 30 fps — against a mixer that keeps the exact sample.
    pub fn seek(&mut self, frame: i64) {
        let target = frame.clamp(0, self.scheduler.frames());
        self.ended = false;
        // The scheduler first: it stops judging the clock the moment it is
        // told, and the engine's answer can arrive at any point after this.
        self.scheduler.seek(target);
        if let Some(candidate) = self.candidate.as_mut() {
            candidate.seek(target);
        }
        self.seek_audio(target);
    }

    /// One step of the picture. Call it in a loop, sleeping for what a
    /// [`Tick::Held`] asks for.
    ///
    /// The settle check is here rather than inside the scheduler because it is
    /// the *engine's* answer being waited for, and the scheduler is the half
    /// that does not know there is an engine.
    pub fn tick(&mut self, sink: &mut dyn Sink) -> Tick {
        self.settle_video();
        // Whether the clock has stopped for good is a question about the feeder
        // and the ring together, and the transport is the only thing holding
        // both. The scheduler sees a clock, and a clock that has stopped looks
        // exactly like one that has not been popped for a moment.
        self.scheduler.set_sound_over(self.sound_over());
        let tick = match self.scheduler.tick(sink) {
            Tick::Failed { reason } if reason == PRESENT_DEFERRED || reason == PRESENT_HIDDEN => {
                Tick::Idle
            }
            tick => tick,
        };
        if tick == Tick::Ended {
            self.ended = true;
        }
        tick
    }

    /// Start decoding a replacement video path without changing the current
    /// one. A newer call supersedes an older candidate, but neither affects
    /// the audio engine or the scheduler currently visible.
    pub fn prepare_video(&mut self, setup: VideoSetup<'_>) {
        let source = FrameSource::new(
            setup.project,
            setup.width,
            setup.height,
            setup.frame_buffering,
            setup.frame_readers,
        );
        let mut candidate =
            Scheduler::new(source, Arc::clone(self.audio.clock()), setup.resync_after);
        let at = self.replacement_target();
        if self.scheduler.is_playing() {
            candidate.play();
            if let Some(exact) = self
                .waiting_target
                .or_else(|| self.scheduler.required_exact())
            {
                candidate.seek(exact);
                if !self.waiting {
                    candidate.settled();
                }
            } else {
                candidate.align_playback(at);
            }
        } else {
            candidate.seek(at);
        }
        self.candidate = Some(candidate);
    }

    /// Try the candidate once. The old path is untouched until this returns
    /// [`VideoReplacement::Committed`]. The sink call happens before the swap,
    /// which makes "ready" mean visible rather than merely decoded.
    pub fn tick_video_replacement(&mut self, sink: &mut dyn Sink) -> VideoReplacement {
        self.settle_video();
        let sound_over = self.sound_over();
        let active_exact = self.scheduler.required_exact();
        let active_position = self.scheduler.position();
        let Some(candidate) = self.candidate.as_mut() else {
            return VideoReplacement::Pending;
        };
        if candidate.is_playing()
            && !self.waiting
            && active_exact.is_none()
            && candidate.required_exact().is_some()
        {
            candidate.align_playback(active_position);
        }
        candidate.set_sound_over(sound_over);
        let mut observed = PresentedSink::new(sink);
        let tick = candidate.tick(&mut observed);
        let reached_sink = observed.reached_sink;
        match tick {
            Tick::Presented { .. } | Tick::Ended if reached_sink => {
                self.scheduler = self.candidate.take().expect("candidate was just borrowed");
                // A video-only replacement does not change transport intent.
                // At the natural end its paused candidate may present the
                // last indexed frame rather than return Ended, but Play must
                // still mean replay from zero.
                self.ended |= tick == Tick::Ended;
                VideoReplacement::Committed(tick)
            }
            Tick::Failed { reason } if reason == PRESENT_DEFERRED => VideoReplacement::Pending,
            Tick::Failed { reason } if reason == PRESENT_HIDDEN => {
                self.scheduler = self.candidate.take().expect("candidate was just borrowed");
                VideoReplacement::Committed(Tick::Idle)
            }
            Tick::Failed { reason } => {
                self.candidate = None;
                VideoReplacement::Failed(reason)
            }
            _ => VideoReplacement::Pending,
        }
    }

    /// Throw away a candidate that timed out or was superseded. The current
    /// video path and the audio engine are unchanged.
    pub fn cancel_video_replacement(&mut self) {
        self.candidate = None;
    }

    /// Ask the current video source for the frame under a paused playhead
    /// again without seeking or reopening audio. While playing, the next
    /// ordinary frame is already the redraw.
    pub fn redraw_video(&mut self) {
        if self.scheduler.is_playing() {
            return;
        }
        self.scheduler.redraw();
        if let Some(candidate) = self.candidate.as_mut() {
            candidate.redraw();
        }
    }

    pub fn has_video_replacement(&self) -> bool {
        self.candidate.is_some()
    }

    fn settle_video(&mut self) {
        if self.waiting && self.audio.feed().seeks_done() >= self.asked {
            self.scheduler.settled();
            if let Some(candidate) = self.candidate.as_mut() {
                candidate.settled();
            }
            self.waiting = false;
            self.waiting_target = None;
        }
    }

    fn replacement_target(&self) -> i64 {
        self.waiting_target
            .unwrap_or_else(|| self.scheduler.position())
    }

    fn seek_audio(&mut self, target: i64) {
        let sample = RationalTime::new(target, self.scheduler.rate()).to_samples(ENGINE_HZ);
        self.audio.seek_sample(sample);
        self.asked += 1;
        self.waiting = true;
        self.waiting_target = Some(target);
    }

    /// The mix has reached the end of the timeline and everything mixed has
    /// been played. Nothing will move the clock after this.
    pub fn sound_over(&self) -> bool {
        !self.waiting && self.audio.feed().ended() && self.audio.buffered_frames() == 0
    }
}

struct PresentedSink<'a> {
    sink: &'a mut dyn Sink,
    reached_sink: bool,
}

impl<'a> PresentedSink<'a> {
    fn new(sink: &'a mut dyn Sink) -> PresentedSink<'a> {
        PresentedSink {
            sink,
            reached_sink: false,
        }
    }
}

impl Sink for PresentedSink<'_> {
    fn show(&mut self, frame: &makevideo_compositor::source::Frame) -> Result<(), String> {
        self.sink.show(frame)?;
        self.reached_sink = true;
        Ok(())
    }

    fn clear(&mut self) -> Result<(), String> {
        self.sink.clear()?;
        self.reached_sink = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
