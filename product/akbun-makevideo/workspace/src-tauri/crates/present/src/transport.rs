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
mod tests {
    use super::*;
    use crate::schedule::DEFAULT_RESYNC;
    use crate::sink::CountingSink;
    use makevideo_audio::realtime::{Clock, CHANNELS};
    use makevideo_audio::source::{Open as AudioOpen, PcmReader};
    use makevideo_compositor::source::{
        CancelRead, FrameReader, Open as FrameOpen, Readers as Frames,
    };
    use makevideo_render::{
        Asset, AssetKind, Clip, Project, ProjectSettings, Rate, Track, TrackKind, FORMAT_VERSION,
    };
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    struct Blank;

    impl FrameReader for Blank {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            buffer.fill(3);
            true
        }
    }

    struct BlankFrames;

    impl Frames for BlankFrames {
        fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Blank))
        }
    }

    struct NumberGate {
        through: AtomicI64,
        cancelled: AtomicBool,
    }

    impl NumberGate {
        fn new(through: i64) -> NumberGate {
            NumberGate {
                through: AtomicI64::new(through),
                cancelled: AtomicBool::new(false),
            }
        }

        fn allow(&self, through: i64) {
            self.through.fetch_max(through, Ordering::Relaxed);
        }
    }

    struct NumberedGateReader {
        next: i64,
        remaining: i64,
        gate: Arc<NumberGate>,
    }

    impl FrameReader for NumberedGateReader {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            if self.remaining <= 0 {
                return false;
            }
            while self.next > self.gate.through.load(Ordering::Relaxed)
                && !self.gate.cancelled.load(Ordering::Relaxed)
            {
                std::thread::sleep(Duration::from_millis(1));
            }
            if self.gate.cancelled.load(Ordering::Relaxed) {
                return false;
            }
            buffer.fill(self.next as u8);
            self.next += 1;
            self.remaining -= 1;
            true
        }

        fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
            Some(Arc::new(NumberGateCancel(Arc::clone(&self.gate))))
        }
    }

    struct NumberGateCancel(Arc<NumberGate>);

    impl CancelRead for NumberGateCancel {
        fn cancel(&self) {
            self.0.cancelled.store(true, Ordering::Relaxed);
        }
    }

    struct NumberedGateFrames(Arc<NumberGate>);

    impl Frames for NumberedGateFrames {
        fn open(&self, request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(NumberedGateReader {
                next: request.in_frame,
                remaining: request.frames,
                gate: Arc::clone(&self.0),
            }))
        }
    }

    struct Solid {
        value: u8,
    }

    impl FrameReader for Solid {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            buffer.fill(self.value);
            true
        }
    }

    struct SolidFrames(u8);

    impl Frames for SolidFrames {
        fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Solid { value: self.0 }))
        }
    }

    struct RecordingFrames(Arc<Mutex<Vec<i64>>>);

    impl Frames for RecordingFrames {
        fn open(&self, request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            self.0.lock().unwrap().push(request.in_frame);
            Some(Box::new(Blank))
        }
    }

    struct Gated {
        value: u8,
        ready: Arc<AtomicBool>,
    }

    impl FrameReader for Gated {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            while !self.ready.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1));
            }
            buffer.fill(self.value);
            true
        }

        fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
            Some(Arc::new(OpenGate(Arc::clone(&self.ready))))
        }
    }

    struct OpenGate(Arc<AtomicBool>);

    impl CancelRead for OpenGate {
        fn cancel(&self) {
            self.0.store(true, Ordering::Relaxed);
        }
    }

    struct GatedFrames {
        value: u8,
        ready: Arc<AtomicBool>,
    }

    struct Blocked {
        value: u8,
        ready: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
    }

    impl FrameReader for Blocked {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            while !self.ready.load(Ordering::Relaxed) && !self.cancelled.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1));
            }
            if self.cancelled.load(Ordering::Relaxed) {
                return false;
            }
            buffer.fill(self.value);
            true
        }

        fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
            Some(Arc::new(CancelFlag(Arc::clone(&self.cancelled))))
        }
    }

    struct CancelFlag(Arc<AtomicBool>);

    impl CancelRead for CancelFlag {
        fn cancel(&self) {
            self.0.store(true, Ordering::Relaxed);
        }
    }

    struct BlockingFrames {
        value: u8,
        ready: Arc<AtomicBool>,
    }

    impl Frames for BlockingFrames {
        fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Blocked {
                value: self.value,
                ready: Arc::clone(&self.ready),
                cancelled: Arc::new(AtomicBool::new(false)),
            }))
        }
    }

    impl Frames for GatedFrames {
        fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Gated {
                value: self.value,
                ready: Arc::clone(&self.ready),
            }))
        }
    }

    #[derive(Clone)]
    struct Values {
        generation: u8,
        shown: Arc<Mutex<Vec<(u8, u8)>>>,
        fail: bool,
    }

    impl Sink for Values {
        fn show(&mut self, frame: &makevideo_compositor::source::Frame) -> Result<(), String> {
            if self.fail {
                return Err("candidate surface refused".into());
            }
            let value = frame
                .layers
                .first()
                .and_then(|layer| layer.pixels.first())
                .copied()
                .unwrap_or_default();
            self.shown.lock().unwrap().push((self.generation, value));
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            if self.fail {
                Err("candidate surface refused".into())
            } else {
                self.shown.lock().unwrap().push((self.generation, 0));
                Ok(())
            }
        }
    }

    struct FrameNumbers(Arc<Mutex<Vec<i64>>>);

    impl Sink for FrameNumbers {
        fn show(&mut self, frame: &makevideo_compositor::source::Frame) -> Result<(), String> {
            self.0.lock().unwrap().push(frame.frame);
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            Ok(())
        }
    }

    struct DeferredSink {
        deferred: usize,
        attempts: usize,
        shown: Vec<i64>,
    }

    #[derive(Default)]
    struct HiddenSink {
        attempts: usize,
    }

    impl Sink for HiddenSink {
        fn show(&mut self, _frame: &makevideo_compositor::source::Frame) -> Result<(), String> {
            self.attempts += 1;
            Err(PRESENT_HIDDEN.into())
        }

        fn clear(&mut self) -> Result<(), String> {
            self.attempts += 1;
            Err(PRESENT_HIDDEN.into())
        }
    }

    impl Sink for DeferredSink {
        fn show(&mut self, frame: &makevideo_compositor::source::Frame) -> Result<(), String> {
            self.attempts += 1;
            if self.deferred != 0 {
                self.deferred -= 1;
                return Err(PRESENT_DEFERRED.into());
            }
            self.shown.push(frame.frame);
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            self.attempts += 1;
            if self.deferred != 0 {
                self.deferred -= 1;
                Err(PRESENT_DEFERRED.into())
            } else {
                Ok(())
            }
        }
    }

    struct Silence;

    impl PcmReader for Silence {
        fn read(&mut self, out: &mut [f32]) -> usize {
            out.fill(0.0);
            out.len()
        }
    }

    struct SilentSources;

    impl AudioReaders for SilentSources {
        fn open(&self, _request: &AudioOpen) -> Option<Box<dyn PcmReader>> {
            Some(Box::new(Silence))
        }
    }

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
            markers: Vec::new(),
        }
    }

    fn transport(project: &Project) -> (Transport, Consumer) {
        transport_with_frames(project, Arc::new(BlankFrames))
    }

    fn transport_with_frames(
        project: &Project,
        frame_readers: Arc<dyn Frames>,
    ) -> (Transport, Consumer) {
        Transport::start(Setup {
            project,
            width: 16,
            height: 16,
            frame_buffering: FrameBuffering::new(6, 15),
            frame_readers,
            audio_buffering: AudioBuffering::default(),
            audio_readers: Arc::new(SilentSources),
            audio: AudioOptions::default(),
            resync_after: DEFAULT_RESYNC,
        })
    }

    fn replacement<'a>(project: &'a Project, readers: Arc<dyn Frames>) -> VideoSetup<'a> {
        VideoSetup {
            project,
            width: 16,
            height: 16,
            frame_buffering: FrameBuffering::new(6, 15),
            frame_readers: readers,
            resync_after: DEFAULT_RESYNC,
        }
    }

    /// Drain the ring the way a device does.
    ///
    /// Advancing the clock is **part of** popping the ring, not something done
    /// alongside it: what time it is, is how many sample frames have been handed
    /// over. A drain that forgets it leaves the clock at zero and the picture
    /// waiting for a turn that never comes, which is the shape of the bug this
    /// helper was written wrong as the first time.
    fn drain(consumer: &Consumer, clock: &Clock, frames: usize) -> usize {
        let mut buffer = vec![0.0f32; frames * CHANNELS];
        let taken = consumer.pop(&mut buffer);
        clock.advance(taken as u64);
        taken
    }

    #[test]
    fn a_transport_opens_paused_on_the_first_frame() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let mut sink = CountingSink::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        while sink.shown == 0 && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown, 1, "one frame, and only one");
        assert!(!transport.is_playing());
    }

    /// The picture follows the sound: the clock only moves when something pops
    /// the ring, and frames only reach the sink as it does.
    #[test]
    fn nothing_is_presented_while_nothing_is_playing_the_sound() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        while sink.shown == 0 && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        transport.play();
        let drawn = sink.shown;
        for _ in 0..200 {
            transport.tick(&mut sink);
        }
        assert_eq!(
            sink.shown, drawn,
            "the clock has not moved, so neither has the picture"
        );

        // Now play the sound, and the picture follows it.
        let mut seen = 0;
        let deadline = Instant::now() + Duration::from_secs(5);
        while sink.shown < drawn + 3 && Instant::now() < deadline {
            seen += drain(&consumer, &clock, 512);
            transport.tick(&mut sink);
        }
        assert!(seen > 0, "the ring should have had something in it");
        assert!(
            sink.shown > drawn,
            "frames should follow the clock once it moves"
        );
    }

    /// The seek the app makes while playing: both halves move, and the picture
    /// is not judged against a clock that has not caught up.
    #[test]
    fn a_play_seek_moves_both_halves_and_settles() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        transport.play();
        transport.seek(150);

        let deadline = Instant::now() + Duration::from_secs(10);
        let mut presented = 0;
        while presented < 2 && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            if let Tick::Presented { .. } = transport.tick(&mut sink) {
                presented += 1;
            }
        }
        assert!(presented >= 2, "playback should resume after the seek");
        assert!(
            transport.position() >= 150,
            "the playhead should be at the target or past it, not before: {}",
            transport.position()
        );
    }

    #[test]
    fn seek_audio_is_not_exposed_until_the_new_position_is_buffered() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let mut sink = CountingSink::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !transport.audio_ready() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(transport.audio_ready(), "initial audio never filled");

        transport.play();
        transport.seek(150);
        assert!(
            !transport.audio_ready(),
            "the old ring must not be heard after seek"
        );

        while !transport.audio_ready() && Instant::now() < deadline {
            consumer.take_flush();
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(
            transport.audio_ready(),
            "new-position audio never became ready"
        );
        assert_eq!(transport.position(), 150);
    }

    #[test]
    fn replacement_during_seek_opens_at_the_pending_audio_target() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let opened = Arc::new(Mutex::new(Vec::new()));
        transport.play();
        transport.seek(150);
        assert_eq!(transport.position(), 150);
        assert_eq!(transport.replacement_target(), 150);

        transport.prepare_video(replacement(
            &project,
            Arc::new(RecordingFrames(Arc::clone(&opened))),
        ));
        let deadline = Instant::now() + Duration::from_secs(5);
        while opened.lock().unwrap().is_empty() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(1));
        }
        let first = opened.lock().unwrap().first().copied();
        assert!(
            first.is_some_and(|frame| frame >= 148),
            "replacement opened at the old clock instead of seek 150: {first:?}"
        );
    }

    #[test]
    fn pause_before_audio_seek_settles_keeps_the_requested_frame() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        transport.play();
        transport.seek(150);
        transport.pause();

        assert_eq!(transport.position(), 150);
        assert_eq!(transport.scheduler().required_exact(), None);
        assert_eq!(transport.replacement_target(), 150);
    }

    #[test]
    fn play_after_a_paused_backward_seek_never_reads_the_old_audio_clock() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        while sink.shown == 0 && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }

        transport.play();
        let old = RationalTime::new(150, transport.scheduler.rate()).to_samples(ENGINE_HZ);
        clock.restart(old as u64);
        transport.pause();
        transport.seek(20);
        transport.play();

        assert_eq!(transport.position(), 20);
        assert_eq!(transport.tick(&mut sink), Tick::Idle);
        assert_eq!(transport.scheduler().counters().resyncs(), 0);

        while transport.waiting && Instant::now() < deadline {
            consumer.take_flush();
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(!transport.waiting, "backward seek did not settle");
        assert_eq!(transport.scheduler().counters().resyncs(), 0);
    }

    #[test]
    fn pause_after_audio_settles_still_keeps_exact_video_and_audio_at_the_target() {
        let project = project();
        let gate = Arc::new(NumberGate::new(18));
        let (mut transport, consumer) =
            transport_with_frames(&project, Arc::new(NumberedGateFrames(Arc::clone(&gate))));
        let clock = Arc::clone(transport.audio().clock());
        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut sink = FrameNumbers(Arc::clone(&shown));

        let deadline = Instant::now() + Duration::from_secs(5);
        while shown.lock().unwrap().is_empty() && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        transport.play();
        transport.seek(20);
        while transport.waiting && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(!transport.waiting, "audio seek did not settle");
        assert_eq!(transport.scheduler.required_exact(), Some(20));

        transport.pause();
        assert_eq!(transport.position(), 20);
        assert!(transport.waiting, "audio must return from T+n to exact T");
        gate.allow(20);
        while (transport.waiting || !shown.lock().unwrap().contains(&20))
            && Instant::now() < deadline
        {
            consumer.take_flush();
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(!transport.waiting);
        assert_eq!(clock.position(transport.scheduler.rate()).value(), 20);
        assert!(shown.lock().unwrap().contains(&20));
    }

    #[test]
    fn play_at_the_end_restarts_from_the_first_frame() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();

        transport.seek(transport.frames());
        transport.play();
        assert_eq!(transport.replacement_target(), 0);

        let deadline = Instant::now() + Duration::from_secs(10);
        let first = loop {
            drain(&consumer, &clock, 512);
            if let Tick::Presented { frame, .. } = transport.tick(&mut sink) {
                break frame;
            }
            assert!(Instant::now() < deadline, "replay never produced a frame");
            std::thread::sleep(Duration::from_millis(1));
        };
        assert_eq!(first, 0);
        assert!(transport.is_playing());
    }

    #[test]
    fn play_after_a_natural_end_restarts_even_if_the_clock_floors_to_the_last_frame() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        transport.play();
        transport.seek(transport.frames() - 1);

        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            drain(&consumer, &clock, 512);
            if transport.tick(&mut sink) == Tick::Ended {
                break;
            }
            assert!(Instant::now() < deadline, "timeline never ended");
        }
        assert!(transport.ended);

        let last = transport.frames() - 1;
        let sample = RationalTime::new(last, transport.scheduler.rate()).to_samples(ENGINE_HZ);
        clock.restart(sample as u64);
        transport.pause();
        assert_eq!(transport.position(), last);

        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(9))));
        loop {
            if matches!(
                transport.tick_video_replacement(&mut sink),
                VideoReplacement::Committed(_)
            ) {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "ended replacement never committed"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(transport.ended, "video replacement cleared natural end");

        transport.play();
        assert_eq!(transport.replacement_target(), 0);
        assert!(!transport.ended);
    }

    /// The second seek is the one that used to break. `Feed::seeks_done` is a
    /// running total, so a transport that reset its own count found the
    /// engine's already past it and called the seek settled before it was.
    #[test]
    fn the_second_seek_is_waited_for_as_carefully_as_the_first() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        transport.play();

        for round in 0..4 {
            let target = 200 - round * 40;
            transport.seek(target);
            // The engine has not answered yet, so nothing may be judged. This
            // is the assertion: with the counter reset, the very next tick
            // acted on a clock still sitting at the old position.
            assert_eq!(
                transport.tick(&mut sink),
                Tick::Idle,
                "round {round} acted before the engine answered"
            );

            let deadline = Instant::now() + Duration::from_secs(10);
            let mut presented = 0;
            while presented < 2 && Instant::now() < deadline {
                drain(&consumer, &clock, 512);
                if let Tick::Presented { .. } = transport.tick(&mut sink) {
                    presented += 1;
                }
            }
            assert!(presented >= 2, "round {round} never resumed after the seek");
            assert!(
                transport.position() >= target,
                "round {round} landed at {} rather than {target}",
                transport.position()
            );
        }
        assert_eq!(
            transport.scheduler().counters().resyncs(),
            0,
            "a settled seek should never look like the picture falling behind"
        );
    }

    #[test]
    fn a_seek_past_the_end_lands_on_the_end() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        transport.seek(100_000);
        assert_eq!(transport.position(), transport.frames());
        transport.seek(-40);
        assert_eq!(transport.position(), 0);
    }

    /// A silent source is still a clock. A project whose audio is all muted, or
    /// which has none, has to play — the engine mixes silence for the
    /// timeline's whole length and the count of samples handed over is what
    /// time it is.
    #[test]
    fn a_timeline_with_no_sound_still_has_a_clock() {
        let mut project = project();
        project.tracks[0].muted = true;
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let mut sink = CountingSink::default();
        transport.play();
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut presented = 0;
        while presented < 3 && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            if let Tick::Presented { .. } = transport.tick(&mut sink) {
                presented += 1;
            }
        }
        assert!(presented >= 3, "a muted timeline should still play");
    }

    /// The seek target crosses to the audio side in samples. 29.97 is the rate
    /// that punishes the alternative: a frame is not a whole number of samples,
    /// so converting through the project rate on the far side would round the
    /// target by up to half a frame while the mixer keeps the exact sample.
    #[test]
    fn a_seek_target_survives_the_trip_into_samples() {
        let rate = Rate::ntsc(30);
        for frame in [0i64, 1, 1_001, 10_000] {
            let samples = RationalTime::new(frame, rate).to_samples(ENGINE_HZ);
            let back = RationalTime::new(samples, Rate::new(ENGINE_HZ, 1)).rescaled(rate);
            assert_eq!(back.value(), frame, "frame {frame}");
        }
    }

    #[test]
    fn old_video_advances_until_the_candidate_is_presented_then_never_returns() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let same_clock = Arc::clone(transport.audio().clock());
        let ready = Arc::new(AtomicBool::new(false));
        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut old = Values {
            generation: 0,
            shown: Arc::clone(&shown),
            fail: false,
        };
        let mut candidate = Values {
            generation: 1,
            shown: Arc::clone(&shown),
            fail: false,
        };

        let deadline = Instant::now() + Duration::from_secs(5);
        while shown.lock().unwrap().is_empty() && Instant::now() < deadline {
            transport.tick(&mut old);
            std::thread::sleep(Duration::from_millis(1));
        }
        transport.play();
        let one_path_ceiling = transport.video_buffer_ceiling();
        transport.prepare_video(replacement(
            &project,
            Arc::new(GatedFrames {
                value: 9,
                ready: Arc::clone(&ready),
            }),
        ));
        assert_eq!(transport.video_buffer_ceiling(), one_path_ceiling * 2);
        assert!(transport.video_buffered_bytes() <= transport.video_buffer_ceiling());
        assert!(Arc::ptr_eq(&same_clock, transport.audio().clock()));

        let before = shown.lock().unwrap().len();
        let deadline = Instant::now() + Duration::from_secs(5);
        while shown.lock().unwrap().len() < before + 3 && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            transport.tick(&mut old);
            assert_eq!(
                transport.tick_video_replacement(&mut candidate),
                VideoReplacement::Pending
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(shown.lock().unwrap().len() >= before + 3);
        assert!(shown.lock().unwrap().iter().all(|entry| *entry == (0, 3)));

        ready.store(true, Ordering::Relaxed);
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            drain(&consumer, &clock, 512);
            transport.tick(&mut old);
            if matches!(
                transport.tick_video_replacement(&mut candidate),
                VideoReplacement::Committed(_)
            ) {
                break;
            }
            assert!(Instant::now() < deadline, "candidate never presented");
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(transport.video_buffer_ceiling(), one_path_ceiling);

        let deadline = Instant::now() + Duration::from_secs(5);
        let first_new = shown
            .lock()
            .unwrap()
            .iter()
            .position(|entry| entry.0 == 1)
            .expect("candidate presentation is the commit point");
        while shown.lock().unwrap().len() < first_new + 3 && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            transport.tick(&mut candidate);
        }
        let log = shown.lock().unwrap();
        assert!(log[..first_new].iter().all(|entry| *entry == (0, 3)));
        assert!(log[first_new..].iter().all(|entry| *entry == (1, 9)));
    }

    #[test]
    fn a_slow_playing_candidate_catches_up_before_its_first_present() {
        let project = project();
        let (mut transport, consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let ready = Arc::new(AtomicBool::new(false));
        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut active = CountingSink::default();
        let mut candidate = FrameNumbers(Arc::clone(&shown));

        let deadline = Instant::now() + Duration::from_secs(5);
        while active.shown == 0 && Instant::now() < deadline {
            transport.tick(&mut active);
            std::thread::sleep(Duration::from_millis(1));
        }
        transport.play();
        transport.prepare_video(replacement(
            &project,
            Arc::new(BlockingFrames {
                value: 9,
                ready: Arc::clone(&ready),
            }),
        ));

        while transport.position() < 40 && Instant::now() < deadline {
            drain(&consumer, &clock, 512);
            transport.tick(&mut active);
            assert_eq!(
                transport.tick_video_replacement(&mut candidate),
                VideoReplacement::Pending
            );
        }
        let current = transport.position();
        assert!(current >= 40, "audio clock did not advance: {current}");
        ready.store(true, Ordering::Relaxed);

        while !matches!(
            transport.tick_video_replacement(&mut candidate),
            VideoReplacement::Committed(_)
        ) {
            assert!(Instant::now() < deadline, "candidate never caught up");
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(
            shown
                .lock()
                .unwrap()
                .first()
                .copied()
                .is_some_and(|frame| frame >= current),
            "candidate jumped backward from clock {current}: {:?}",
            shown.lock().unwrap().as_slice()
        );
    }

    #[test]
    fn a_candidate_surface_failure_keeps_the_old_video_and_audio_clock() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let clock = Arc::clone(transport.audio().clock());
        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut old = Values {
            generation: 0,
            shown: Arc::clone(&shown),
            fail: false,
        };
        let mut failing = Values {
            generation: 1,
            shown: Arc::clone(&shown),
            fail: true,
        };

        let deadline = Instant::now() + Duration::from_secs(5);
        while shown.lock().unwrap().is_empty() && Instant::now() < deadline {
            transport.tick(&mut old);
            std::thread::sleep(Duration::from_millis(1));
        }
        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(9))));
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match transport.tick_video_replacement(&mut failing) {
                VideoReplacement::Failed(reason) => {
                    assert_eq!(reason, "candidate surface refused");
                    break;
                }
                _ => assert!(
                    Instant::now() < deadline,
                    "candidate never reached its sink"
                ),
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(!transport.has_video_replacement());
        assert!(Arc::ptr_eq(&clock, transport.audio().clock()));

        let before = shown.lock().unwrap().len();
        transport.redraw_video();
        let deadline = Instant::now() + Duration::from_secs(5);
        while shown.lock().unwrap().len() == before && Instant::now() < deadline {
            transport.tick(&mut old);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(shown.lock().unwrap().last().copied(), Some((0, 3)));
    }

    #[test]
    fn a_candidate_waits_for_an_actual_present_after_occlusion() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let mut sink = DeferredSink {
            deferred: 1,
            attempts: 0,
            shown: Vec::new(),
        };
        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(9))));

        let deadline = Instant::now() + Duration::from_secs(5);
        while sink.attempts == 0 && Instant::now() < deadline {
            assert_eq!(
                transport.tick_video_replacement(&mut sink),
                VideoReplacement::Pending
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.attempts, 1);
        assert!(sink.shown.is_empty());
        assert!(transport.has_video_replacement());

        while !matches!(
            transport.tick_video_replacement(&mut sink),
            VideoReplacement::Committed(_)
        ) {
            assert!(Instant::now() < deadline, "candidate never retried present");
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(sink.shown, vec![0]);
    }

    #[test]
    fn a_hidden_candidate_commits_without_waiting_and_presents_exact_when_shown() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let mut hidden = HiddenSink::default();
        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(9))));

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match transport.tick_video_replacement(&mut hidden) {
                VideoReplacement::Committed(Tick::Idle) => break,
                VideoReplacement::Pending => {
                    assert!(Instant::now() < deadline, "hidden candidate never decoded");
                    std::thread::sleep(Duration::from_millis(1));
                }
                other => panic!("unexpected hidden replacement result: {other:?}"),
            }
        }
        assert_eq!(hidden.attempts, 1);
        assert!(!transport.has_video_replacement());

        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut visible = FrameNumbers(Arc::clone(&shown));
        assert!(matches!(
            transport.tick(&mut visible),
            Tick::Presented { frame: 0, .. }
        ));
        assert_eq!(shown.lock().unwrap().as_slice(), &[0]);
    }

    #[test]
    fn a_new_candidate_supersedes_the_old_candidate_without_mixing_frames() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let shown = Arc::new(Mutex::new(Vec::new()));
        let mut sink = Values {
            generation: 2,
            shown: Arc::clone(&shown),
            fail: false,
        };
        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(7))));
        transport.prepare_video(replacement(&project, Arc::new(SolidFrames(9))));

        let deadline = Instant::now() + Duration::from_secs(5);
        while !matches!(
            transport.tick_video_replacement(&mut sink),
            VideoReplacement::Committed(_)
        ) {
            assert!(Instant::now() < deadline, "new candidate never presented");
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(shown.lock().unwrap().as_slice(), &[(2, 9)]);
    }

    #[test]
    fn guide_redraw_keeps_the_exact_paused_picture_without_a_replacement() {
        let project = project();
        let (mut transport, _consumer) = transport(&project);
        let frames = Arc::new(Mutex::new(Vec::new()));
        let mut sink = FrameNumbers(Arc::clone(&frames));
        transport.seek(120);

        let deadline = Instant::now() + Duration::from_secs(5);
        while frames.lock().unwrap().last().copied() != Some(120) && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(frames.lock().unwrap().last().copied(), Some(120));
        assert!(!transport.has_video_replacement());

        transport.redraw_video();
        let before = frames.lock().unwrap().len();
        let deadline = Instant::now() + Duration::from_secs(5);
        while frames.lock().unwrap().len() == before && Instant::now() < deadline {
            transport.tick(&mut sink);
            std::thread::sleep(Duration::from_millis(1));
        }
        let shown = frames.lock().unwrap();
        assert_eq!(shown[shown.len() - 2..], [120, 120]);
        assert!(!transport.has_video_replacement());
    }
}
