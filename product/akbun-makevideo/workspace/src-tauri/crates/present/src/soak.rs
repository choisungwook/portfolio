//! Whether the picture keeps up with the sound, as a number.
//!
//! The third of the three meters, and the one the issue's acceptance rests on.
//! The frame supply meter asks whether frames arrive in time; the audio meter
//! asks whether the sound is continuous and the clock honest. Neither can see
//! the failure this stage is about, because that one only exists once the two
//! are joined: a frame drawn at the wrong moment.
//!
//! What is measured here is therefore **A/V drift** first — how far the frame
//! on screen is from the sound coming out — and the interval between frames
//! second. The rest of the report is in the same shape as the other two so the
//! three sit side by side in `quality/`.
//!
//! There is no window. The sound goes to a thread with a stopwatch, exactly as
//! in the audio meter, and the picture goes to an [`OffscreenSink`] that
//! composites on the real device and drops the result. What is missing against
//! the app is one `present` call. What is present is all of the timing, which
//! is the thing that was broken.
//!
//! [`OffscreenSink`]: crate::sink::OffscreenSink

use crate::player::Tick;
use crate::transport::Transport;
use makevideo_audio::engine::Feed;
use makevideo_audio::realtime::{Clock, Consumer, CHANNELS, ENGINE_HZ};
use makevideo_audio::soak::BUFFER_FRAMES;
use makevideo_render::Rate;
use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// The same rule the frame supply meter derives its limits by, so the two are
/// judged against one another rather than against two opinions.
fn interval_limit(rate: Rate, factor: f64) -> f64 {
    (1000.0 / rate.as_f64() * factor).ceil()
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub present_interval_p50_ms: f64,
    pub present_interval_p99_ms: f64,
    /// Frames the scheduler threw away because the clock was past them. The
    /// page harness and the supply meter both hold dropped frames to 0.1%, and
    /// a skipped frame is exactly a dropped frame — the whole difference is
    /// that this one is dropped on purpose.
    pub skipped_rate: f64,
    /// **The number this stage exists for.** How far the frame on screen is
    /// from the sound, at the instant it reached the screen. The same 50 ms the
    /// page harness holds A/V drift to.
    pub av_drift_p99_ms: f64,
    /// First frame after a start or a seek.
    pub startup_delay_p99_ms: f64,
    /// The buffering held to its own promise, same as the supply meter.
    pub peak_buffered_bytes: u64,
    /// The sound breaking up. Carried here because a picture that stalls
    /// because the clock stopped is not a scheduling fault, and without this
    /// the report cannot tell the two apart.
    pub underrun_rate: f64,
}

impl Limits {
    pub fn new(rate: Rate, peak_buffered_bytes: u64) -> Limits {
        Limits {
            present_interval_p50_ms: interval_limit(rate, 1.25),
            present_interval_p99_ms: interval_limit(rate, 2.0),
            skipped_rate: 0.001,
            av_drift_p99_ms: 50.0,
            startup_delay_p99_ms: 500.0,
            peak_buffered_bytes,
            underrun_rate: 0.001,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub name: String,
    /// How long to play for, in project frames.
    pub frames: u64,
    /// Seek back to `seek_to` every this many presented frames.
    pub seek_every: Option<u64>,
    pub seek_to: i64,
    /// How long a run may make no progress before it is called stalled.
    pub stall_grace_ms: u64,
    /// How long the whole scenario may take, in multiples of the timeline it is
    /// playing.
    ///
    /// A source that cannot keep up does not stall — it makes progress, slowly,
    /// skipping and jumping — so the no-progress rule never fires and a run
    /// that should fail in seconds instead grinds on. Twenty seconds of
    /// timeline took four and a half minutes before this was here, which is
    /// long enough that nobody runs the meter.
    pub budget_multiple: f64,
    pub metadata: BTreeMap<String, String>,
}

impl Scenario {
    pub fn new(name: &str, frames: u64) -> Scenario {
        Scenario {
            name: name.to_string(),
            frames,
            seek_every: None,
            seek_to: 0,
            stall_grace_ms: 3_000,
            budget_multiple: 3.0,
            metadata: BTreeMap::new(),
        }
    }

    pub fn seeking(mut self, every: u64, to: i64) -> Scenario {
        self.seek_every = Some(every);
        self.seek_to = to;
        self
    }

    pub fn noting(mut self, key: &str, value: String) -> Scenario {
        self.metadata.insert(key.to_string(), value);
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub presented_frames: u64,
    /// Late frames the scheduler dropped instead of drawing, while playback was
    /// running. This is the one held to the drop rate.
    pub skipped_frames: u64,
    /// Late frames dropped while catching up after a start or a seek.
    ///
    /// Reported and not judged. A refill empties the queues on purpose and the
    /// clock keeps going through it, so the picture is behind by exactly the
    /// refill when it comes back and walks forward to meet it. That is the
    /// startup delay being paid, and it is already counted once under that
    /// name; counting the same frames again as drops would charge every run for
    /// its own beginning. The frame supply and audio meters draw the same line.
    pub skipped_while_refilling: u64,
    /// Jumps: the picture was so far behind that walking to the clock would
    /// have cost more than refilling from it.
    pub resyncs: u64,
    /// Polls that found nothing buffered. Absorbed rather than seen, so this is
    /// a warning and not a failure — the supply meter is where a starving
    /// source is judged.
    pub starved_polls: u64,
    /// The sink refused. A surface that has gone away, in the app; never, here.
    pub draw_failures: u64,
    pub present_interval_p50_ms: Option<f64>,
    pub present_interval_p99_ms: Option<f64>,
    /// Absolute distance between the frame drawn and the sound heard, in
    /// milliseconds, at the instant the drawing finished.
    pub av_drift_p50_ms: Option<f64>,
    pub av_drift_p99_ms: Option<f64>,
    pub av_drift_max_ms: Option<f64>,
    /// Signed, so a report says which way. Positive is the picture behind the
    /// sound, which is the only direction the scheduler can produce: it never
    /// draws a frame before its turn.
    pub av_lateness_p99_ms: Option<f64>,
    pub startup_delay_p99_ms: Option<f64>,
    pub peak_buffered_bytes: u64,
    pub seeks: u64,
    pub underruns: u64,
    pub audio_buffers: u64,
    pub stalled: bool,
    /// The scenario was abandoned for taking too long rather than for stopping.
    pub overran: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checks {
    pub present_interval_p50_ms: bool,
    pub present_interval_p99_ms: bool,
    pub skipped_frames: bool,
    pub av_drift_p99_ms: bool,
    pub startup_delay_p99_ms: bool,
    pub peak_buffered_bytes: bool,
    pub underruns: bool,
    pub drew_every_frame: bool,
    pub not_stalled: bool,
    pub finished_in_time: bool,
}

impl Checks {
    pub fn pass(&self) -> bool {
        self.present_interval_p50_ms
            && self.present_interval_p99_ms
            && self.skipped_frames
            && self.av_drift_p99_ms
            && self.startup_delay_p99_ms
            && self.peak_buffered_bytes
            && self.underruns
            && self.drew_every_frame
            && self.not_stalled
            && self.finished_in_time
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub pass: bool,
    pub checks: Checks,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioReport {
    pub scenario: String,
    pub duration_ms: u64,
    pub fps: f64,
    pub metadata: BTreeMap<String, String>,
    pub metrics: Metrics,
    pub limits: Limits,
    pub evaluation: Evaluation,
}

/// Sorted, `ceil(fraction * len) - 1`. The same element the other two meters
/// and the page harness pick.
fn percentile(values: &[f64], fraction: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let index = ((fraction * sorted.len() as f64).ceil() as usize).saturating_sub(1);
    Some(sorted[index.min(sorted.len() - 1)])
}

fn millis(span: Duration) -> f64 {
    span.as_secs_f64() * 1000.0
}

fn within(value: Option<f64>, limit: f64) -> bool {
    value.map(|value| value <= limit).unwrap_or(true)
}

/// The device, with the driver replaced by a stopwatch.
///
/// Popping one buffer per buffer period is what a real callback does, and it is
/// also what makes the clock move — which is the whole reason it is here. It
/// keeps popping through a seek on purpose: emptying the ring is the consumer's
/// job, so something that stopped to wait for a seek would be waiting for the
/// one thing only it can cause.
struct Speaker {
    stop: Arc<AtomicBool>,
    /// Set by the measuring loop around a seek. While it is on the ring is
    /// being refilled on purpose and a short pop is not the engine failing.
    /// `audio-soak` draws the same line with its own `refill_since`.
    refilling: Arc<AtomicBool>,
    underruns: Arc<AtomicU64>,
    buffers: Arc<AtomicU64>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Speaker {
    fn start(consumer: Consumer, clock: Arc<Clock>, feed: Arc<Feed>) -> Speaker {
        let stop = Arc::new(AtomicBool::new(false));
        let refilling = Arc::new(AtomicBool::new(true));
        let underruns = Arc::new(AtomicU64::new(0));
        let buffers = Arc::new(AtomicU64::new(0));
        let period = Duration::from_secs_f64(BUFFER_FRAMES as f64 / f64::from(ENGINE_HZ));

        // What the callback has handed over has not been heard yet. A real
        // device reports its own; here it is exactly one buffer.
        clock.set_latency(BUFFER_FRAMES as u64);

        let thread = {
            let (stop, refilling, underruns, buffers) = (
                Arc::clone(&stop),
                Arc::clone(&refilling),
                Arc::clone(&underruns),
                Arc::clone(&buffers),
            );
            std::thread::spawn(move || {
                let mut buffer = vec![0.0f32; BUFFER_FRAMES * CHANNELS];
                let mut due = Instant::now();
                while !stop.load(Ordering::Relaxed) {
                    due += period;
                    let now = Instant::now();
                    if now < due {
                        std::thread::sleep(due - now);
                    } else {
                        // Overslept: start counting again from here rather than
                        // trying to make the time up in a burst of pops, which
                        // would move the clock faster than the world.
                        due = now;
                    }
                    let taken = consumer.pop(&mut buffer);
                    clock.advance(taken as u64);
                    buffers.fetch_add(1, Ordering::Relaxed);
                    if taken < BUFFER_FRAMES {
                        // Three things make a short pop, and only one of them
                        // is a fault. A ring emptied on purpose by a seek is
                        // reported as a startup delay instead; a ring run dry
                        // because the timeline finished is the end, and a
                        // project is almost never a whole number of buffers
                        // long. What is left is the mix failing to keep up,
                        // which is the click somebody hears.
                        let ending = feed.ended() && consumer.filled() == 0;
                        if !ending && !refilling.load(Ordering::Relaxed) {
                            let missing = (BUFFER_FRAMES - taken) as u64;
                            clock.starve(missing);
                            underruns.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            })
        };
        Speaker {
            stop,
            refilling,
            underruns,
            buffers,
            thread: Some(thread),
        }
    }
}

impl Drop for Speaker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// Play `scenario.frames` frames and report what reached the screen.
///
/// The transport is left wherever the run finished, and the speaker is stopped
/// on the way out, so a caller running several scenarios builds one transport
/// each. That is deliberate: a scenario helped by queues the one before it left
/// warm is not a measurement of anything.
pub fn measure(
    transport: &mut Transport,
    consumer: Consumer,
    clock: Arc<Clock>,
    sink: &mut dyn crate::player::Sink,
    scenario: &Scenario,
) -> ScenarioReport {
    let rate = transport.scheduler().rate();
    let limits = Limits::new(rate, transport.scheduler().buffer_ceiling() as u64);
    let grace = Duration::from_millis(scenario.stall_grace_ms);
    // What the timeline being played is worth in wall clock, times the
    // allowance, plus one grace period so a short scenario is not judged by
    // its startup.
    let budget = Duration::from_secs_f64(
        scenario.frames as f64 / rate.as_f64() * scenario.budget_multiple.max(1.0),
    ) + grace;
    let speaker = Speaker::start(consumer, clock, Arc::clone(transport.audio().feed()));
    let started = Instant::now();

    let mut intervals: Vec<f64> = Vec::new();
    let mut drift: Vec<f64> = Vec::new();
    let mut lateness: Vec<f64> = Vec::new();
    let mut startups: Vec<f64> = Vec::new();
    let (mut presented, mut seeks) = (0u64, 0u64);
    let (mut skipped, mut skipped_refilling) = (0u64, 0u64);
    let mut peak = 0usize;
    let mut stalled = false;
    let mut overran = false;
    let mut last_present: Option<Instant> = None;
    let mut since_seek = 0u64;

    // Set while waiting for the first frame of a start or a seek. What it
    // measures is a startup delay, and nothing inside it counts as an interval:
    // a refill is already reported once and charging it twice would make every
    // seek look like the scheduler losing its place. The other two meters draw
    // the same line.
    let mut waiting_since = Some(Instant::now());
    let mut progress = Instant::now();

    transport.play();

    while presented < scenario.frames && !stalled && !overran {
        let tick = transport.tick(sink);
        match tick {
            Tick::Presented { late_ms, .. } => {
                let at = Instant::now();
                speaker.refilling.store(false, Ordering::Relaxed);
                if let Some(began) = waiting_since.take() {
                    // The first frame of a start or a seek. It is a refill, and
                    // a refill is reported once — as a startup delay. Charging
                    // it again as drift and as an interval would make every
                    // seek look like the scheduler losing the sound, when what
                    // it did was empty the queues on purpose and fill them from
                    // the target. The frame supply and audio meters draw the
                    // same line, and it is the same line the knowledge note
                    // about a harness not counting its own delay draws.
                    startups.push(millis(began.elapsed()));
                } else {
                    if let Some(previous) = last_present {
                        intervals.push(millis(at - previous));
                    }
                    drift.push(late_ms.abs());
                    lateness.push(late_ms);
                }
                last_present = Some(at);
                presented += 1;
                since_seek += 1;
                progress = at;
                peak = peak.max(transport.scheduler().buffered_bytes());

                if let Some(every) = scenario.seek_every {
                    if since_seek >= every {
                        speaker.refilling.store(true, Ordering::Relaxed);
                        transport.seek(scenario.seek_to);
                        seeks += 1;
                        since_seek = 0;
                        last_present = None;
                        waiting_since = Some(Instant::now());
                    }
                }
            }
            Tick::Skipped { .. } => {
                if waiting_since.is_some() {
                    skipped_refilling += 1;
                } else {
                    skipped += 1;
                }
                progress = Instant::now();
            }
            Tick::Resynced { .. } | Tick::Failed { .. } => {
                progress = Instant::now();
            }
            Tick::Held { wait } => {
                if !wait.is_zero() {
                    std::thread::sleep(wait);
                }
            }
            Tick::Starved | Tick::Idle => {
                std::thread::sleep(Duration::from_millis(1));
            }
            // A soak longer than the timeline wraps rather than stopping, and a
            // wrap is a seek: both halves are thrown away and refilled.
            Tick::Ended => {
                speaker.refilling.store(true, Ordering::Relaxed);
                transport.seek(0);
                seeks += 1;
                since_seek = 0;
                last_present = None;
                waiting_since = Some(Instant::now());
                progress = Instant::now();
            }
        }
        if progress.elapsed() >= grace {
            stalled = true;
        }
        if started.elapsed() >= budget {
            overran = true;
        }
    }

    let counters = transport.scheduler().counters();
    let metrics = Metrics {
        presented_frames: presented,
        skipped_frames: skipped,
        skipped_while_refilling: skipped_refilling,
        resyncs: counters.resyncs(),
        starved_polls: counters.starved(),
        draw_failures: counters.failures(),
        present_interval_p50_ms: percentile(&intervals, 0.5),
        present_interval_p99_ms: percentile(&intervals, 0.99),
        av_drift_p50_ms: percentile(&drift, 0.5),
        av_drift_p99_ms: percentile(&drift, 0.99),
        av_drift_max_ms: percentile(&drift, 1.0),
        av_lateness_p99_ms: percentile(&lateness, 0.99),
        startup_delay_p99_ms: percentile(&startups, 0.99),
        peak_buffered_bytes: peak as u64,
        seeks,
        underruns: speaker.underruns.load(Ordering::Relaxed),
        audio_buffers: speaker.buffers.load(Ordering::Relaxed),
        stalled,
        overran,
    };
    drop(speaker);

    // The denominator is what playback actually walked through once it was
    // running, so the rate is drops per frame shown rather than per frame of
    // the whole run.
    let shown = metrics.presented_frames + metrics.skipped_frames;
    let checks = Checks {
        present_interval_p50_ms: within(
            metrics.present_interval_p50_ms,
            limits.present_interval_p50_ms,
        ),
        present_interval_p99_ms: within(
            metrics.present_interval_p99_ms,
            limits.present_interval_p99_ms,
        ),
        skipped_frames: shown > 0
            && (metrics.skipped_frames as f64) / (shown as f64) <= limits.skipped_rate,
        av_drift_p99_ms: within(metrics.av_drift_p99_ms, limits.av_drift_p99_ms),
        startup_delay_p99_ms: within(metrics.startup_delay_p99_ms, limits.startup_delay_p99_ms),
        peak_buffered_bytes: metrics.peak_buffered_bytes <= limits.peak_buffered_bytes,
        underruns: metrics.audio_buffers > 0
            && (metrics.underruns as f64) / (metrics.audio_buffers as f64) <= limits.underrun_rate,
        // A run that drew nothing has no percentiles, and every `within` above
        // would wave it through on `None`. This is the check that refuses it.
        drew_every_frame: metrics.presented_frames >= scenario.frames
            && metrics.draw_failures == 0,
        not_stalled: !metrics.stalled,
        finished_in_time: !metrics.overran,
    };

    ScenarioReport {
        scenario: scenario.name.clone(),
        duration_ms: millis(started.elapsed()) as u64,
        fps: rate.as_f64(),
        metadata: scenario.metadata.clone(),
        metrics,
        limits,
        evaluation: Evaluation {
            pass: checks.pass(),
            checks,
        },
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateInfo {
    pub num: u32,
    pub den: u32,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub rate: RateInfo,
}

impl ProjectInfo {
    pub fn new(width: u32, height: u32, rate: Rate) -> ProjectInfo {
        ProjectInfo {
            width,
            height,
            fps: rate.as_f64(),
            rate: RateInfo {
                num: rate.num(),
                den: rate.den(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub schema_version: u32,
    pub captured_at_unix_ms: u128,
    pub engine: &'static str,
    pub project: ProjectInfo,
    pub config: BTreeMap<String, String>,
    pub pass: bool,
    pub scenarios: Vec<ScenarioReport>,
}

impl Run {
    pub fn new(
        project: ProjectInfo,
        config: BTreeMap<String, String>,
        scenarios: Vec<ScenarioReport>,
    ) -> Run {
        Run {
            schema_version: 1,
            captured_at_unix_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|since| since.as_millis())
                .unwrap_or(0),
            engine: "native-viewport",
            project,
            pass: scenarios.iter().all(|report| report.evaluation.pass),
            config,
            scenarios,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::DEFAULT_RESYNC;
    use crate::sink::CountingSink;
    use crate::transport::Setup;
    use makevideo_audio::engine::Options as AudioOptions;
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

    #[test]
    fn the_percentiles_pick_the_same_element_the_other_meters_do() {
        let values: Vec<f64> = (1..=100).map(|value| value as f64).collect();
        assert_eq!(percentile(&values, 0.5), Some(50.0));
        assert_eq!(percentile(&values, 0.99), Some(99.0));
        assert_eq!(percentile(&values, 1.0), Some(100.0));
        assert_eq!(percentile(&[], 0.5), None);
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
}
