use super::*;
use crate::schedule::DEFAULT_RESYNC;
use crate::sink::CountingSink;
use crate::transport::Setup;
use makevideo_audio::engine::Options as AudioOptions;
use makevideo_audio::realtime::Ring;
use makevideo_audio::source::{
    Buffering as AudioBuffering, Open as AudioOpen, PcmReader, Readers as AudioReaders,
};
use makevideo_compositor::source::{
    Buffering as FrameBuffering, FrameReader, Open as FrameOpen, Readers as FrameReaders,
};
use makevideo_render::{
    Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind, FORMAT_VERSION,
};

struct Paced(Duration);

#[test]
fn an_inactive_speaker_flushes_without_advancing_the_clock() {
    let (producer, consumer) = Ring::new(BUFFER_FRAMES * 2);
    let samples = vec![0.0; BUFFER_FRAMES * CHANNELS];
    assert_eq!(producer.push(&samples), BUFFER_FRAMES);
    let clock = Arc::new(Clock::new());
    let speaker = Speaker::start(consumer, Arc::clone(&clock), Arc::new(Feed::default()));
    let flush = producer.request_flush();
    let deadline = Instant::now() + Duration::from_millis(100);
    while producer.flushed() < flush && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(1));
    }

    assert_eq!(producer.flushed(), flush);
    assert_eq!(clock.played_frames(), 0);
    drop(speaker);
}

impl FrameReader for Paced {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        if !self.0.is_zero() {
            std::thread::sleep(self.0);
        }
        buffer.fill(5);
        true
    }
}

struct Pace(Duration);

impl FrameReaders for Pace {
    fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
        Some(Box::new(Paced(self.0)))
    }
}

struct FirstDelayed {
    delay: Option<Duration>,
}

impl FrameReader for FirstDelayed {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        if let Some(delay) = self.delay.take() {
            std::thread::sleep(delay);
        }
        buffer.fill(7);
        true
    }
}

struct DelayFirst(Duration);

impl FrameReaders for DelayFirst {
    fn open(&self, _request: &FrameOpen) -> Option<Box<dyn FrameReader>> {
        Some(Box::new(FirstDelayed {
            delay: Some(self.0),
        }))
    }
}

struct Silence;

impl PcmReader for Silence {
    fn read(&mut self, out: &mut [f32]) -> usize {
        out.fill(0.0);
        out.len()
    }
}

struct Quiet;

impl AudioReaders for Quiet {
    fn open(&self, _request: &AudioOpen) -> Option<Box<dyn PcmReader>> {
        Some(Box::new(Silence))
    }
}

/// 300 frames of 30 fps: ten seconds.
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
                denoise: 0.0,
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

fn run(per_frame: Duration, scenario: &Scenario) -> ScenarioReport {
    let project = project();
    let (mut transport, consumer) = Transport::start(Setup {
        project: &project,
        width: 16,
        height: 16,
        frame_buffering: FrameBuffering::new(6, 15),
        frame_readers: Arc::new(Pace(per_frame)),
        audio_buffering: AudioBuffering::default(),
        audio_readers: Arc::new(Quiet),
        audio: AudioOptions::default(),
        resync_after: DEFAULT_RESYNC,
    });
    let clock = Arc::clone(transport.audio().clock());
    let mut sink = CountingSink::default();
    measure(&mut transport, consumer, clock, &mut sink, scenario)
}

fn run_replacement(first_frame_delay: Duration, scenario: &Scenario) -> ScenarioReport {
    let project = project();
    let (mut transport, consumer) = Transport::start(Setup {
        project: &project,
        width: 16,
        height: 16,
        frame_buffering: FrameBuffering::new(6, 15),
        frame_readers: Arc::new(Pace(Duration::from_millis(1))),
        audio_buffering: AudioBuffering::default(),
        audio_readers: Arc::new(Quiet),
        audio: AudioOptions::default(),
        resync_after: DEFAULT_RESYNC,
    });
    let clock = Arc::clone(transport.audio().clock());
    let mut sink = CountingSink::default();
    measure_video_replacement(
        &mut transport,
        consumer,
        clock,
        &mut sink,
        scenario,
        VideoSetup {
            project: &project,
            width: 16,
            height: 16,
            frame_buffering: FrameBuffering::new(6, 15),
            frame_readers: Arc::new(DelayFirst(first_frame_delay)),
            resync_after: DEFAULT_RESYNC,
        },
        10,
    )
}

#[test]
fn a_source_that_keeps_up_presents_every_frame_in_time() {
    let report = run(
        Duration::from_millis(1),
        &Scenario::new("continuous-playback", 60),
    );
    assert_eq!(report.metrics.presented_frames, 60);
    assert!(!report.metrics.stalled, "{:?}", report.metrics);
    assert!(
        report.evaluation.checks.av_drift_p99_ms,
        "drift {:?} against {}",
        report.metrics.av_drift_p99_ms, report.limits.av_drift_p99_ms
    );
    assert!(
        report.metrics.peak_buffered_bytes <= report.limits.peak_buffered_bytes,
        "the buffering has to keep its own promise"
    );
}

/// A harness that cannot fail is not measuring anything. Sixty milliseconds
/// a frame against a 33 ms budget drains the queue, the clock walks away
/// from the picture, and the run has to say so.
/// A harness that cannot fail is not measuring anything, and one that takes
/// four minutes to say so is not run. Sixty milliseconds a frame against a
/// 33 ms budget drains the queue and the clock walks away from the picture;
/// what the run must do is notice, and notice inside its budget.
#[test]
fn a_decoder_slower_than_the_frame_rate_fails_the_run() {
    let began = Instant::now();
    let report = run(
        Duration::from_millis(60),
        &Scenario::new("continuous-playback", 40),
    );
    assert!(!report.evaluation.pass, "{report:?}");
    assert!(
        report.metrics.skipped_frames > 0
            || report.metrics.resyncs > 0
            || report.metrics.stalled
            || report.metrics.overran,
        "a source that cannot keep up should show as skips, jumps, a stall or an overrun: {:?}",
        report.metrics
    );
    // Forty frames of 30 fps is 1.3 seconds of timeline; three times that
    // plus the grace is under 8 seconds, and the run has to be over by
    // then whatever the source is doing.
    assert!(
        began.elapsed() < Duration::from_secs(20),
        "the meter has to give up on its own: {:?}",
        began.elapsed()
    );
}

#[test]
fn a_seek_is_counted_and_its_first_frame_is_a_startup_delay() {
    let report = run(
        Duration::from_millis(1),
        &Scenario::new("repeated-seek", 40).seeking(10, 0),
    );
    assert!(report.metrics.seeks >= 3, "{:?}", report.metrics);
    assert_eq!(report.metrics.presented_frames, 40);
    assert!(report.metrics.startup_delay_p99_ms.is_some());
}

fn visible(generation: u64, frame: i64) -> Option<VisibleIdentity> {
    Some(VisibleIdentity {
        generation,
        frame: Some(frame),
    })
}

#[test]
fn an_advancing_clock_with_one_fixed_visible_frame_fails() {
    let mut continuity = VisibleContinuity::new();
    assert!(continuity.observe(100, visible(0, 100)));
    assert!(continuity.observe(102, visible(0, 100)));
    assert!(
        !continuity.observe(103, visible(0, 100)),
        "the audio clock crossed three frames while the screen stayed fixed"
    );
}

#[test]
fn a_generation_handoff_on_the_same_frame_does_not_restart_the_freeze_window() {
    let mut continuity = VisibleContinuity::new();
    assert!(continuity.observe(100, visible(0, 100)));
    assert!(continuity.observe(101, visible(0, 100)));
    assert!(continuity.observe(102, visible(1, 100)));
    assert!(
        !continuity.observe(103, visible(1, 100)),
        "a new generation showing the same frame is still one frozen picture"
    );
}

#[test]
fn old_video_may_keep_advancing_until_the_candidate_commits() {
    let mut continuity = VisibleContinuity::new();
    let observations = [
        (40, visible(0, 40)),
        (41, visible(0, 41)),
        (42, visible(0, 42)),
        (43, visible(0, 43)),
        // The same project frame in a new generation is the first-frame
        // commit, not a frozen copy of the old one.
        (43, visible(1, 43)),
        (44, visible(1, 44)),
    ];
    assert!(observations
        .into_iter()
        .all(|(clock, identity)| continuity.observe(clock, identity)));
}

#[test]
fn a_playing_seek_accepts_only_blank_or_two_frames_before_exact() {
    assert!(visible_within_seek_window(None, 20));
    assert!(visible_within_seek_window(
        Some(VisibleIdentity {
            generation: 0,
            frame: None,
        }),
        20,
    ));
    for frame in [18, 19, 20] {
        assert!(visible_within_seek_window(visible(0, frame), 20));
    }
    assert!(!visible_within_seek_window(visible(0, 17), 20));
    assert!(!visible_within_seek_window(visible(0, 21), 20));
}

#[test]
fn a_delayed_replacement_passes_while_the_old_video_keeps_moving() {
    let report = run_replacement(
        Duration::from_millis(20),
        &Scenario::new("live-reconfiguration", 60),
    );
    assert_eq!(report.metrics.presented_frames, 60, "{report:?}");
    assert!(!report.metrics.stalled, "{report:?}");
    assert!(report.evaluation.pass, "{report:?}");
}

#[test]
fn the_percentiles_pick_the_same_element_the_other_meters_do() {
    let values: Vec<f64> = (1..=100).map(|value| value as f64).collect();
    assert_eq!(percentile(&values, 0.5), Some(50.0));
    assert_eq!(percentile(&values, 0.99), Some(99.0));
    assert_eq!(percentile(&values, 1.0), Some(100.0));
    assert_eq!(percentile(&[], 0.5), None);
}

#[test]
fn startup_ends_only_when_the_picture_is_less_than_one_frame_late() {
    let rate = Rate::fps(30);
    assert!(startup_caught_up(33.0, rate));
    assert!(!startup_caught_up(34.0, rate));
}

/// Every `within` says yes to `None`, so a run that drew nothing at all
/// would pass on percentiles alone. This is the check that stops it.
#[test]
fn a_run_that_drew_nothing_cannot_pass() {
    let checks = Checks {
        present_interval_p50_ms: true,
        present_interval_p99_ms: true,
        skipped_frames: true,
        av_drift_p99_ms: true,
        startup_delay_p99_ms: true,
        peak_buffered_bytes: true,
        underruns: true,
        drew_every_frame: false,
        not_stalled: true,
        finished_in_time: true,
    };
    assert!(!checks.pass());
}
