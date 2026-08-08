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

/// The two halves of playback, moved together.
pub struct Transport {
    audio: AudioEngine,
    scheduler: Scheduler,
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
                asked: 0,
                waiting: false,
            },
            consumer,
        )
    }

    pub fn scheduler(&self) -> &Scheduler {
        &self.scheduler
    }

    pub fn audio(&self) -> &AudioEngine {
        &self.audio
    }

    pub fn is_playing(&self) -> bool {
        self.scheduler.is_playing()
    }

    /// Where the playhead is, in frames of the project rate.
    pub fn position(&self) -> i64 {
        self.scheduler.position()
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
        self.scheduler.play();
    }

    /// Stop, and leave the frame the playhead landed on drawn.
    pub fn pause(&mut self) {
        let at = self.scheduler.position();
        self.scheduler.pause(at);
    }

    /// Move both halves to `frame`.
    ///
    /// The audio is moved by **sample**, converted from the frame here, because
    /// that is the unit the mixer places clips in. Handing the engine a frame
    /// index and letting it convert would round the target by up to half a
    /// frame — 16.7 ms at 30 fps — against a mixer that keeps the exact sample.
    pub fn seek(&mut self, frame: i64) {
        let target = frame.clamp(0, self.scheduler.frames());
        // The scheduler first: it stops judging the clock the moment it is
        // told, and the engine's answer can arrive at any point after this.
        self.scheduler.seek(target);
        let sample = RationalTime::new(target, self.scheduler.rate()).to_samples(ENGINE_HZ);
        self.audio.seek_sample(sample);
        self.asked += 1;
        self.waiting = true;
    }

    /// One step of the picture. Call it in a loop, sleeping for what a
    /// [`Tick::Held`] asks for.
    ///
    /// The settle check is here rather than inside the scheduler because it is
    /// the *engine's* answer being waited for, and the scheduler is the half
    /// that does not know there is an engine.
    pub fn tick(&mut self, sink: &mut dyn Sink) -> Tick {
        if self.waiting && self.audio.feed().seeks_done() >= self.asked {
            self.scheduler.settled();
            self.waiting = false;
        }
        // Whether the clock has stopped for good is a question about the feeder
        // and the ring together, and the transport is the only thing holding
        // both. The scheduler sees a clock, and a clock that has stopped looks
        // exactly like one that has not been popped for a moment.
        self.scheduler.set_sound_over(self.sound_over());
        self.scheduler.tick(sink)
    }

    /// The mix has reached the end of the timeline and everything mixed has
    /// been played. Nothing will move the clock after this.
    pub fn sound_over(&self) -> bool {
        !self.waiting && self.audio.feed().ended() && self.audio.buffered_frames() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::DEFAULT_RESYNC;
    use crate::sink::CountingSink;
    use makevideo_audio::realtime::{Clock, CHANNELS};
    use makevideo_audio::source::{Open as AudioOpen, PcmReader};
    use makevideo_compositor::source::{FrameReader, Open as FrameOpen, Readers as Frames};
    use makevideo_render::{
        Asset, AssetKind, Clip, Project, ProjectSettings, Rate, Track, TrackKind, FORMAT_VERSION,
    };
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
        }
    }

    fn transport(project: &Project) -> (Transport, Consumer) {
        Transport::start(Setup {
            project,
            width: 16,
            height: 16,
            frame_buffering: FrameBuffering::new(6, 15),
            frame_readers: Arc::new(BlankFrames),
            audio_buffering: AudioBuffering::default(),
            audio_readers: Arc::new(SilentSources),
            audio: AudioOptions::default(),
            resync_after: DEFAULT_RESYNC,
        })
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
}
