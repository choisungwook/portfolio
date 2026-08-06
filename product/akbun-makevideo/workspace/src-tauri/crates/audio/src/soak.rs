//! Whether the sound holds up, as a number rather than as an opinion.
//!
//! The engine side of the playback quality harness, and the sister of the frame
//! source's supply meter. It reports in the same shape and by the same rules,
//! so a run from here sits next to one from `supply-soak` and the two can be
//! read together.
//!
//! It measures **the mix only**. No device is opened, because a machine with no
//! sound card is exactly where this needs to run and because a driver that
//! wakes late and a mixer that is late look the same in a recording and have
//! nothing to do with each other. What plays the samples here is a thread with
//! a stopwatch, taking exactly one buffer per buffer period, which is the only
//! rate at which a ring can genuinely run dry.
//!
//! Two numbers carry the argument the audio clock is built on:
//!
//! - `underruns`, because an underrun is the one failure everybody hears.
//! - `endedOnTheSample`, because the whole claim of counting samples rather
//!   than milliseconds is that a ten minute timeline ends on its last sample
//!   and not near it. A single missing sample fails it.

use crate::engine::Engine;
use crate::realtime::{Clock, Consumer, ENGINE_HZ, CHANNELS};
use makevideo_render::Rate;
use serde::Serialize;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

/// Sample frames per buffer. 512 at 48 kHz is 10.7 ms, which is what a desktop
/// output asks for by default on every platform this ships to.
pub const BUFFER_FRAMES: usize = 512;

fn buffer_period() -> Duration {
    Duration::from_secs_f64(BUFFER_FRAMES as f64 / f64::from(ENGINE_HZ))
}

/// What a scenario has to stay inside to pass.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    /// Buffers the mix could not fill. The page harness counts dropped frames
    /// against the same figure, and a click is worth more than a dropped frame,
    /// so this is the same 0.1% held to a harder consequence.
    pub underrun_rate: f64,
    /// The buffer period, doubled. A meter that misses its own slot is not the
    /// engine failing, but a run where it happens constantly is not measuring
    /// the engine either.
    pub buffer_interval_p99_ms: f64,
    /// First sound after a start or a seek. The same 500 ms the frame source is
    /// held to, because the two happen together and the slower one is what is
    /// felt.
    pub startup_delay_p99_ms: f64,
    /// How far the clock may fall behind the wall clock over the whole run.
    /// This is the A/V drift figure from the quality harness: the picture
    /// follows this clock, so the clock falling behind the world is the picture
    /// falling behind it too.
    pub drift_ms: f64,
}

impl Default for Limits {
    fn default() -> Limits {
        Limits {
            underrun_rate: 0.001,
            buffer_interval_p99_ms: (buffer_period().as_secs_f64() * 2_000.0).ceil(),
            startup_delay_p99_ms: 500.0,
            drift_ms: 50.0,
        }
    }
}

/// One run of the meter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub name: String,
    /// How many sample frames to play. Reaching the end of the timeline wraps
    /// back to the start, which is counted as a seek.
    pub frames: u64,
    /// Seek back to `seek_to` every this many frames.
    pub seek_every: Option<u64>,
    pub seek_to: i64,
    /// How long the first buffer after a start or a seek may take before the
    /// run is called stalled and abandoned.
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
    pub buffers: u64,
    pub played_frames: u64,
    /// Buffers that were not completely filled.
    pub underruns: u64,
    /// Sample frames of silence those buffers had to write, which is the size
    /// of the holes rather than the number of them.
    pub silent_frames: u64,
    pub buffer_interval_p50_ms: Option<f64>,
    pub buffer_interval_p99_ms: Option<f64>,
    pub startup_delay_p99_ms: Option<f64>,
    /// The least the ring held once it had filled. How much slack was left, and
    /// the number that moves first when a project gets heavier.
    pub ring_low_water_frames: Option<u64>,
    pub ring_low_water_ms: Option<f64>,
    /// Blocks the decoders could not produce in time. The ring absorbs these,
    /// so they are a warning rather than a failure.
    ///
    /// There is no peak memory figure here on purpose. The frame source reports
    /// one because a queue of 1080p frames is 50 MB a clip and memory is the
    /// axis its buffering trades against; a second of stereo is 384 KB, so the
    /// same figure here would be a check that can never fail.
    pub late_blocks: u64,
    pub seeks: u64,
    /// The clock against the wall clock at the end of the run.
    pub drift_ms: f64,
    /// Playing the timeline through landed on its last sample exactly. `None`
    /// when the run was shorter than the timeline, so there was no end to land
    /// on.
    pub ended_on_the_sample: Option<bool>,
    /// No sound arrived at all within the grace period and the run was
    /// abandoned.
    pub stalled: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checks {
    pub underruns: bool,
    pub buffer_interval_p99_ms: bool,
    pub startup_delay_p99_ms: bool,
    pub drift_ms: bool,
    pub ended_on_the_sample: bool,
    pub not_stalled: bool,
}

impl Checks {
    pub fn pass(&self) -> bool {
        self.underruns
            && self.buffer_interval_p99_ms
            && self.startup_delay_p99_ms
            && self.drift_ms
            && self.ended_on_the_sample
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
    /// Of that, how long was spent refilling after a seek rather than playing.
    pub refilling_ms: u64,
    pub metadata: BTreeMap<String, String>,
    pub metrics: Metrics,
    pub limits: Limits,
    pub evaluation: Evaluation,
}

/// Sorted, `ceil(fraction * len) - 1`. The frame harness picks the same
/// element, which matters more than which convention is right.
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

/// Play `scenario.frames` sample frames at real time and report what happened.
///
/// This loop is the device callback with the driver replaced by a stopwatch. It
/// pops one buffer per buffer period, advances the clock by what it actually
/// got, and counts the rest as silence — which is what a real callback does,
/// and is why the numbers from here mean something about a real output.
pub fn measure(
    engine: &Engine,
    consumer: &Consumer,
    clock: &Clock,
    scenario: &Scenario,
) -> ScenarioReport {
    let limits = Limits::default();
    let period = buffer_period();
    let grace = Duration::from_millis(scenario.stall_grace_ms);
    let total = engine.total_samples();

    let mut intervals: Vec<f64> = Vec::new();
    let mut startups: Vec<f64> = Vec::new();
    let (mut buffers, mut played, mut underruns, mut silent, mut seeks) = (0u64, 0u64, 0u64, 0u64, 0u64);
    let mut ended_on_the_sample: Option<bool> = None;
    let mut stalled = false;
    let mut buffer = vec![0.0f32; BUFFER_FRAMES * CHANNELS];

    // The clock's latency is one buffer: what the callback has handed over has
    // not been heard yet. A real device reports its own; here it is exact.
    clock.set_latency(BUFFER_FRAMES as u64);

    // Ready means the ring is at the fill the feeder aims for, not that one
    // buffer has arrived. Starting on one buffer means starting into a ring
    // that is still filling, and then the next few buffers come out short —
    // which would be the meter manufacturing the underruns it is here to
    // count.
    let ready_at = engine.target_fill();

    // Nothing has been asked to seek yet, so nothing has to keep running for
    // this one wait to finish.
    let began = Instant::now();
    if engine.wait_until_ready(ready_at, began + grace) {
        startups.push(millis(began.elapsed()));
    } else {
        stalled = true;
    }

    let started = Instant::now();
    let mut due = started;
    let mut last: Option<Instant> = None;
    let mut since_seek = 0u64;
    // Time spent refilling after a seek. Real time in which nothing played, and
    // not drift: the clock holds still through it and resumes in the right
    // place. It is already reported as a startup delay, and charging it twice
    // would make every seek look like the engine losing its place. The frame
    // supply meter draws the same line.
    let mut refilling = Duration::ZERO;
    // Set when a seek has been asked for and the refill has not finished.
    //
    // The loop keeps running through it rather than blocking, for two reasons.
    // A device does not stop asking for buffers because the editor moved the
    // playhead, so blocking would be measuring something no player does. And
    // emptying the ring is the consumer's job — a meter that stops popping to
    // wait for the seek is waiting for something only it can cause.
    let mut refill_since: Option<Instant> = None;

    while !stalled && played < scenario.frames {
        due += period;
        let now = Instant::now();
        if now < due {
            std::thread::sleep(due - now);
        }
        let taken = consumer.pop(&mut buffer);
        clock.advance(taken as u64);

        if let Some(began) = refill_since {
            if engine.settled() && (engine.buffered_frames() >= ready_at || engine.feed().ended()) {
                let took = began.elapsed();
                startups.push(millis(took));
                refilling += took;
                refill_since = None;
                last = None;
                due = Instant::now();
            } else if began.elapsed() >= grace {
                stalled = true;
            }
            continue;
        }

        if taken < BUFFER_FRAMES {
            let missing = BUFFER_FRAMES - taken;
            // A ring run dry because the timeline finished is not an underrun,
            // it is the end, and the last buffer of a timeline is short almost
            // every time — a project is not a whole number of buffers long.
            // Whether it landed on the right sample is checked below; charging
            // it here as well would put a failure in every clean run.
            if !(engine.feed().ended() && consumer.filled() == 0) {
                clock.starve(missing as u64);
                underruns += 1;
                silent += missing as u64;
            }
        }
        buffers += 1;
        played += taken as u64;
        since_seek += taken as u64;

        let at = Instant::now();
        if let Some(previous) = last {
            intervals.push(millis(at - previous));
        }
        last = Some(at);

        // Past the end: check the landing, then wrap, because a soak longer
        // than the timeline should keep measuring rather than stop.
        if engine.feed().ended() && consumer.filled() == 0 {
            ended_on_the_sample =
                Some(ended_on_the_sample.unwrap_or(true) && ended_exactly(clock, total));
            engine.seek_sample(0);
            seeks += 1;
            since_seek = 0;
            last = None;
            refill_since = Some(Instant::now());
            continue;
        }

        if let Some(every) = scenario.seek_every {
            if since_seek >= every {
                engine.seek_sample(scenario.seek_to);
                seeks += 1;
                since_seek = 0;
                last = None;
                refill_since = Some(Instant::now());
            }
        }
    }

    let elapsed = started.elapsed().saturating_sub(refilling);
    // What the clock says against what the world says, over the time playback
    // was actually running. The picture follows the clock, so this is the
    // picture falling behind the world.
    let heard = Duration::from_secs_f64(played as f64 / f64::from(ENGINE_HZ));
    let drift_ms = (millis(elapsed) - millis(heard)).abs();

    let metrics = Metrics {
        buffers,
        played_frames: played,
        underruns,
        silent_frames: silent,
        buffer_interval_p50_ms: percentile(&intervals, 0.5),
        buffer_interval_p99_ms: percentile(&intervals, 0.99),
        startup_delay_p99_ms: percentile(&startups, 0.99),
        ring_low_water_frames: engine.feed().low_water().map(|frames| frames as u64),
        ring_low_water_ms: engine
            .feed()
            .low_water()
            .map(|frames| frames as f64 * 1000.0 / f64::from(ENGINE_HZ)),
        late_blocks: engine.feed().late_blocks(),
        seeks,
        drift_ms,
        ended_on_the_sample,
        stalled,
    };
    let checks = Checks {
        underruns: metrics.buffers > 0
            && (metrics.underruns as f64) / (metrics.buffers as f64) <= limits.underrun_rate,
        buffer_interval_p99_ms: within(
            metrics.buffer_interval_p99_ms,
            limits.buffer_interval_p99_ms,
        ),
        startup_delay_p99_ms: within(metrics.startup_delay_p99_ms, limits.startup_delay_p99_ms),
        drift_ms: metrics.drift_ms <= limits.drift_ms,
        ended_on_the_sample: metrics.ended_on_the_sample.unwrap_or(true),
        not_stalled: !metrics.stalled,
    };
    ScenarioReport {
        scenario: scenario.name.clone(),
        duration_ms: millis(started.elapsed()) as u64,
        refilling_ms: millis(refilling) as u64,
        metadata: scenario.metadata.clone(),
        metrics,
        limits,
        evaluation: Evaluation {
            pass: checks.pass(),
            checks,
        },
    }
}

/// Playing a timeline through has to land on its last sample and not near it.
fn ended_exactly(clock: &Clock, total: i64) -> bool {
    // The clock's position takes the device buffer off, so what has really been
    // handed over is the position plus that latency.
    let handed = clock.position_samples() + clock.latency_frames();
    handed as i64 == total
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
    pub fps: f64,
    pub rate: RateInfo,
    pub engine_hz: u32,
    pub buffer_frames: u32,
}

impl ProjectInfo {
    pub fn new(rate: Rate) -> ProjectInfo {
        ProjectInfo {
            fps: rate.as_f64(),
            rate: RateInfo {
                num: rate.num(),
                den: rate.den(),
            },
            engine_hz: ENGINE_HZ,
            buffer_frames: BUFFER_FRAMES as u32,
        }
    }
}

/// A whole measurement, in the shape the frame supply meter writes so the two
/// sit side by side in `quality/`.
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
            engine: "audio-mix",
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
    use crate::source::tests::{level_readers, one_clip_project};
    use crate::source::{Buffering, Readers};
    use crate::engine::Options;
    use std::sync::Arc;
    use std::time::Duration as StdDuration;

    fn run(readers: Arc<dyn Readers>, scenario: &Scenario) -> ScenarioReport {
        let project = one_clip_project();
        let (engine, consumer, clock) =
            Engine::start(&project, Buffering::default(), readers, Options::default());
        measure(&engine, &consumer, &clock, scenario)
    }

    /// A reader that takes far longer than real time per block, which is the
    /// case the meter exists to catch.
    struct Molasses;

    impl crate::source::PcmReader for Molasses {
        fn read(&mut self, buffer: &mut [f32]) -> usize {
            std::thread::sleep(StdDuration::from_millis(200));
            buffer.fill(0.0);
            buffer.len()
        }
    }

    struct Slow;

    impl Readers for Slow {
        fn open(&self, _request: &crate::source::Open) -> Option<Box<dyn crate::source::PcmReader>> {
            Some(Box::new(Molasses))
        }
    }

    #[test]
    fn a_mix_that_keeps_up_plays_without_a_hole_in_it() {
        // A quarter of a second of a one second timeline, so no wrap and no
        // seek: the plainest case there is, and the one that has to be clean.
        let report = run(level_readers(1.0), &Scenario::new("continuous-playback", 12_000));
        assert!(!report.metrics.stalled, "{report:?}");
        assert_eq!(report.metrics.underruns, 0, "{:?}", report.metrics);
        assert!(report.metrics.played_frames >= 12_000);
        assert!(report.evaluation.pass, "{report:?}");
    }

    #[test]
    fn playing_the_timeline_through_lands_on_its_last_sample() {
        // The whole point of counting samples instead of milliseconds. One
        // sample short and this fails, which is what makes it worth having.
        let report = run(level_readers(1.0), &Scenario::new("continuous-playback", 50_000));
        assert_eq!(
            report.metrics.ended_on_the_sample,
            Some(true),
            "{:?}",
            report.metrics
        );
        assert!(report.metrics.seeks >= 1, "it should have wrapped");
    }

    #[test]
    fn a_decoder_slower_than_real_time_fails_the_run() {
        // A harness that cannot fail is not measuring anything. 200 ms a block
        // against a 21 ms budget drains the ring and every buffer after that is
        // a hole.
        let report = run(Arc::new(Slow), &Scenario::new("continuous-playback", 24_000));
        assert!(!report.evaluation.pass, "{report:?}");
        assert!(
            report.metrics.stalled || report.metrics.underruns > 0,
            "{:?}",
            report.metrics
        );
    }

    #[test]
    fn a_seek_is_counted_and_its_first_sound_is_a_startup_delay() {
        let report = run(
            level_readers(1.0),
            &Scenario::new("repeated-seek", 24_000).seeking(4_000, 0),
        );
        assert!(report.metrics.seeks >= 4, "{:?}", report.metrics);
        assert!(report.metrics.startup_delay_p99_ms.is_some());
        assert!(!report.metrics.stalled, "{report:?}");
    }

    #[test]
    fn the_percentiles_pick_the_same_element_the_frame_harness_does() {
        let values: Vec<f64> = (1..=100).map(|value| value as f64).collect();
        assert_eq!(percentile(&values, 0.5), Some(50.0));
        assert_eq!(percentile(&values, 0.99), Some(99.0));
        assert_eq!(percentile(&[], 0.5), None);
        assert_eq!(percentile(&[7.0], 0.99), Some(7.0));
    }
}
