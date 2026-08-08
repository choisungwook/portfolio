//! Whether the frame source keeps up, as a number rather than as an opinion.
//!
//! This is the engine side of the playback quality harness the page runs. It
//! measures the same things by the same rules — frame interval p50 and p99, how
//! late a frame was, how long the first frame took, how much memory the buffers
//! hold — so a report from here sits next to `quality/media-element-macos.json`
//! and the two can be compared line by line.
//!
//! It measures **supply only**. Nothing is drawn, encoded or played, because a
//! frame that arrives late and a frame that is drawn slowly look the same on
//! screen and have nothing to do with each other. Audio is not here either: it
//! never leaves ffmpeg, so there is no drift for this layer to have.
//!
//! The loop paces itself to the frame rate on purpose. Pulling as fast as
//! possible would measure throughput, and playback is not a throughput problem:
//! the queues have to survive being read at exactly one frame per frame period,
//! which is the only rate at which a buffer can run dry.

use crate::source::{FrameSource, Supply};
use makevideo_render::Rate;
use serde::Serialize;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

/// The page harness derives its limits from the frame rate this way, so the two
/// engines are judged by one rule. See `src/quality.js`.
fn interval_limit(rate: Rate, factor: f64) -> f64 {
    (1000.0 / rate.as_f64() * factor).ceil()
}

/// What a scenario has to stay inside to pass.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub frame_interval_p50_ms: f64,
    pub frame_interval_p99_ms: f64,
    /// Frames that were not ready by the instant they were due. The page
    /// harness counts dropped frames against the same figure.
    pub late_frame_rate: f64,
    /// The first frame after a start or a seek.
    pub startup_delay_p99_ms: f64,
    /// What the queues are allowed to hold. Derived from the buffering
    /// settings, so this is the implementation being held to its own bound
    /// rather than to a round number.
    pub peak_buffered_bytes: u64,
}

impl Limits {
    pub fn for_source(source: &FrameSource) -> Limits {
        Limits {
            frame_interval_p50_ms: interval_limit(source.rate(), 1.25),
            frame_interval_p99_ms: interval_limit(source.rate(), 2.0),
            late_frame_rate: 0.001,
            startup_delay_p99_ms: 500.0,
            peak_buffered_bytes: source.buffer_ceiling() as u64,
        }
    }
}

/// One run of the meter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub name: String,
    /// How many frames to pull. Reaching the end of the timeline wraps back to
    /// the start, which is counted as a seek.
    pub frames: u64,
    /// Seek back to `seek_to` every this many frames.
    pub seek_every: Option<u64>,
    pub seek_to: i64,
    /// How long past its due time a frame may still arrive before the run is
    /// called stalled and abandoned.
    pub stall_grace_ms: u64,
    pub metadata: BTreeMap<String, String>,
}

impl Scenario {
    pub fn new(name: &str, frames: u64) -> Scenario {
        Scenario {
            name: name.to_string(),
            frames,
            seek_every: None,
            seek_to: 0,
            stall_grace_ms: 2_000,
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
    pub total_frames: u64,
    pub late_frames: u64,
    /// How late the late ones were. Seven frames late by 4 ms and seven late by
    /// 200 ms are the same count and not the same problem.
    pub late_by_p99_ms: Option<f64>,
    pub frame_interval_p50_ms: Option<f64>,
    pub frame_interval_p99_ms: Option<f64>,
    /// How long the consumer waited on the source for a frame. The interval
    /// figures say what a viewer would see; this one says how much slack was
    /// left, and it is the number that moves first when a project gets heavier.
    pub supply_wait_p50_ms: Option<f64>,
    pub supply_wait_p99_ms: Option<f64>,
    pub startup_delay_p99_ms: Option<f64>,
    pub peak_buffered_bytes: u64,
    pub end_buffered_bytes: u64,
    pub seeks: u64,
    /// A frame never arrived and the run was abandoned.
    pub stalled: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checks {
    pub frame_interval_p50_ms: bool,
    pub frame_interval_p99_ms: bool,
    pub late_frames: bool,
    pub startup_delay_p99_ms: bool,
    pub peak_buffered_bytes: bool,
    pub not_stalled: bool,
}

impl Checks {
    pub fn pass(&self) -> bool {
        self.frame_interval_p50_ms
            && self.frame_interval_p99_ms
            && self.late_frames
            && self.startup_delay_p99_ms
            && self.peak_buffered_bytes
            && self.not_stalled
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

/// Sorted, `ceil(fraction * len) - 1`. The page harness picks the same element,
/// which matters more than which convention is right.
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
    value.map(|value| value <= limit).unwrap_or(false)
}

/// Pull `scenario.frames` frames at the project rate and report what happened.
///
/// The source is left wherever the run finished, so a caller running several
/// scenarios on one source seeks between them.
pub fn measure(source: &mut FrameSource, scenario: &Scenario) -> ScenarioReport {
    let limits = Limits::for_source(source);
    let rate = source.rate();
    let interval = Duration::from_secs_f64(1.0 / rate.as_f64());
    let grace = Duration::from_millis(scenario.stall_grace_ms);
    let started = Instant::now();

    let mut intervals: Vec<f64> = Vec::new();
    let mut waits: Vec<f64> = Vec::new();
    let mut startups: Vec<f64> = Vec::new();
    let mut late_by: Vec<f64> = Vec::new();
    let (mut delivered, mut late, mut seeks) = (0u64, 0u64, 0u64);
    let mut peak = 0usize;
    let mut stalled = false;

    // Deadlines are counted from here, and a seek moves it: the frame after a
    // seek is due one frame period after the seek, not at the slot the old
    // playhead would have been in.
    let mut due = started;
    let mut shown_at: Option<Instant> = None;
    let mut first_after_start = true;

    while delivered < scenario.frames && source.frames() > 0 {
        due += interval;
        let asked = Instant::now();
        match source.take_by(due.max(asked) + grace) {
            Supply::Ready(_frame) => {
                let ready = Instant::now();
                let wait = ready - asked;
                waits.push(millis(wait));
                let shown = if first_after_start {
                    // Playback begins when the first frame is really there, so
                    // the clock is set from it. What came before is the startup
                    // delay, which has its own metric; counting it as lateness
                    // as well would charge one wait twice and make every seek
                    // look like a supply failure.
                    startups.push(millis(wait));
                    first_after_start = false;
                    due = ready;
                    ready
                } else {
                    // Late only when the source made the frame wait. When this
                    // loop oversleeps its own slot the frame was already there,
                    // and that is the meter's jitter rather than the supply's.
                    let owed = due.max(asked);
                    if ready > owed {
                        late += 1;
                        late_by.push(millis(ready - owed));
                    }
                    // A frame that is ready early still waits for its slot,
                    // exactly as a player would show it, so what is measured is
                    // the gap a viewer would see.
                    ready.max(due)
                };
                if let Some(previous) = shown_at {
                    intervals.push(millis(shown - previous));
                }
                shown_at = Some(shown);
                delivered += 1;
                peak = peak.max(source.buffered_bytes());
                let now = Instant::now();
                if now < shown {
                    std::thread::sleep(shown - now);
                }
                if let Some(every) = scenario.seek_every {
                    if delivered % every == 0 {
                        source.seek(scenario.seek_to);
                        seeks += 1;
                        due = Instant::now();
                        shown_at = None;
                        first_after_start = true;
                    }
                }
            }
            Supply::Starved => {
                stalled = true;
                break;
            }
            Supply::End => {
                // A soak longer than the timeline wraps rather than stopping,
                // and a wrap is a seek: the queues are thrown away and refilled
                // just the same.
                source.seek(0);
                seeks += 1;
                due = Instant::now();
                shown_at = None;
                first_after_start = true;
            }
        }
    }

    let metrics = Metrics {
        total_frames: delivered,
        late_frames: late,
        late_by_p99_ms: percentile(&late_by, 0.99),
        frame_interval_p50_ms: percentile(&intervals, 0.5),
        frame_interval_p99_ms: percentile(&intervals, 0.99),
        supply_wait_p50_ms: percentile(&waits, 0.5),
        supply_wait_p99_ms: percentile(&waits, 0.99),
        startup_delay_p99_ms: percentile(&startups, 0.99),
        peak_buffered_bytes: peak as u64,
        end_buffered_bytes: source.buffered_bytes() as u64,
        seeks,
        stalled,
    };
    let checks = Checks {
        frame_interval_p50_ms: within(metrics.frame_interval_p50_ms, limits.frame_interval_p50_ms),
        frame_interval_p99_ms: within(metrics.frame_interval_p99_ms, limits.frame_interval_p99_ms),
        late_frames: metrics.total_frames > 0
            && (metrics.late_frames as f64) / (metrics.total_frames as f64)
                <= limits.late_frame_rate,
        startup_delay_p99_ms: within(metrics.startup_delay_p99_ms, limits.startup_delay_p99_ms),
        peak_buffered_bytes: metrics.peak_buffered_bytes <= limits.peak_buffered_bytes,
        not_stalled: !metrics.stalled,
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

/// A whole measurement, in the shape the page harness writes so the two engines
/// produce comparable files.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub schema_version: u32,
    /// Unix milliseconds. The page writes an ISO string; nothing in this crate
    /// formats dates, and a number needs no dependency to be right.
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
            engine: "prefetch-source",
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
    use crate::source::{Buffering, FrameReader, FrameSource, Open, Readers};
    use makevideo_render::{
        Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind, FORMAT_VERSION,
    };
    use std::sync::Arc;

    struct Paced(Duration);

    impl FrameReader for Paced {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            if !self.0.is_zero() {
                std::thread::sleep(self.0);
            }
            buffer.fill(1);
            true
        }
    }

    struct Pace(Duration);

    impl Readers for Pace {
        fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Paced(self.0)))
        }
    }

    /// Sixty frames of 30 fps: two seconds of timeline, and two seconds of
    /// wall clock, because the meter runs in real time.
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
                duration_ms: 2_000,
                width: 16,
                height: 16,
                has_audio: false,
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
                    out_point: 60,
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

    fn source(per_frame: Duration) -> FrameSource {
        FrameSource::new(
            &project(),
            16,
            16,
            Buffering::new(6, 15),
            Arc::new(Pace(per_frame)),
        )
    }

    #[test]
    fn a_source_that_keeps_up_delivers_every_frame_inside_its_bound() {
        let mut source = source(Duration::from_millis(1));
        let report = measure(&mut source, &Scenario::new("continuous-supply", 30));
        assert_eq!(report.metrics.total_frames, 30);
        assert!(!report.metrics.stalled, "{report:?}");
        // The bound the buffering promises, checked rather than assumed.
        assert!(report.metrics.peak_buffered_bytes <= report.limits.peak_buffered_bytes);
        // Not "never late": this thread can be held off its own slot on a busy
        // runner, and asserting a clean sheet would make the suite fail for
        // whatever else the machine was doing. That the meter *reports* a slow
        // source as failing is the next test, where the margin is not a matter
        // of scheduling.
        assert!(
            report.metrics.late_frames * 5 <= report.metrics.total_frames,
            "a source with 33x the time it needs should rarely be late: {:?}",
            report.metrics
        );
    }

    #[test]
    fn a_decoder_slower_than_the_frame_rate_fails_the_run() {
        // 60 ms a frame against a 33 ms budget: the queue drains and every
        // frame after that is late. This is the case the meter exists to catch.
        let mut source = source(Duration::from_millis(60));
        let report = measure(&mut source, &Scenario::new("continuous-supply", 20));
        assert!(!report.evaluation.pass, "{report:?}");
        assert!(
            report.metrics.late_frames > 0,
            "frames should have arrived late: {:?}",
            report.metrics
        );
    }

    #[test]
    fn a_seek_is_counted_and_its_first_frame_is_a_startup_delay() {
        let mut source = source(Duration::from_millis(1));
        let report = measure(
            &mut source,
            &Scenario::new("repeated-seek", 20).seeking(5, 0),
        );
        assert_eq!(report.metrics.seeks, 4);
        assert_eq!(report.metrics.total_frames, 20);
        assert!(report.metrics.startup_delay_p99_ms.is_some());
        assert!(!report.metrics.stalled, "{report:?}");
    }

    #[test]
    fn running_past_the_end_wraps_instead_of_stopping() {
        let mut source = source(Duration::from_millis(1));
        // The timeline is 60 frames; asking for 70 wraps once.
        let report = measure(&mut source, &Scenario::new("continuous-supply", 70));
        assert_eq!(report.metrics.total_frames, 70);
        assert_eq!(report.metrics.seeks, 1);
    }

    #[test]
    fn the_percentiles_pick_the_same_element_the_page_harness_does() {
        let values: Vec<f64> = (1..=100).map(|value| value as f64).collect();
        assert_eq!(percentile(&values, 0.5), Some(50.0));
        assert_eq!(percentile(&values, 0.99), Some(99.0));
        assert_eq!(percentile(&[], 0.5), None);
        assert_eq!(percentile(&[7.0], 0.99), Some(7.0));
    }
}
