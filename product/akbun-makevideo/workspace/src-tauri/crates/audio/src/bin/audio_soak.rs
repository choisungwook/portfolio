//! Measures the audio engine against real media, with no device anywhere.
//!
//! ```text
//! cargo run -p makevideo-audio --bin audio-soak -- \
//!   /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 60
//! ```
//!
//! It prints the report in the shape the frame supply meter writes, and exits
//! non-zero when a scenario fails. That exit code is the point: the mix has a
//! pass mark now, and it is checked by running it rather than by listening.
//!
//! No output is opened on purpose. A driver that wakes late and a mixer that is
//! late sound the same in a recording, and this measures the second one. What
//! plays the samples here is a thread taking one buffer per buffer period,
//! which is what a device does and is also what a machine with no sound card
//! can do.

use makevideo_audio::engine::{Engine, Options};
use makevideo_audio::realtime::ENGINE_HZ;
use makevideo_audio::soak::{measure, ProjectInfo, Run, Scenario, ScenarioReport};
use makevideo_audio::source::{Buffering, FfmpegReaders, DEFAULT_DEPTH, DEFAULT_LEAD};
use makevideo_render::{Project, TrackKind};
use std::collections::BTreeMap;
use std::sync::Arc;

struct Settings {
    project: String,
    seconds: f64,
    depth: usize,
    lead: i64,
    seek_every_seconds: f64,
    report: Option<String>,
}

const USAGE: &str = "\
usage: audio-soak <project.akbunvideo> [options]

  --seconds N        how long each scenario runs (default 30)
  --depth N          blocks buffered per clip (default 8)
  --lead N           engine samples of head start for a decoder (default 24000)
  --seek-every N     seconds between seeks in the seek scenario (default 2)
  --report PATH      also write the report as JSON
  --help
";

fn parse(mut args: std::env::Args) -> Result<Settings, String> {
    args.next();
    let mut settings = Settings {
        project: String::new(),
        seconds: 30.0,
        depth: DEFAULT_DEPTH,
        lead: DEFAULT_LEAD,
        seek_every_seconds: 2.0,
        report: None,
    };
    while let Some(argument) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| format!("{argument} needs a value"))
        };
        match argument.as_str() {
            "--seconds" => {
                settings.seconds = value()?
                    .parse()
                    .map_err(|_| "--seconds wants a number".to_string())?
            }
            "--depth" => {
                settings.depth = value()?
                    .parse()
                    .map_err(|_| "--depth wants a number".to_string())?
            }
            "--lead" => {
                settings.lead = value()?
                    .parse()
                    .map_err(|_| "--lead wants a number".to_string())?
            }
            "--seek-every" => {
                settings.seek_every_seconds = value()?
                    .parse()
                    .map_err(|_| "--seek-every wants a number".to_string())?
            }
            "--report" => settings.report = Some(value()?),
            other if other.starts_with('-') => return Err(format!("unknown option {other}")),
            other => settings.project = other.to_string(),
        }
    }
    if settings.project.is_empty() {
        return Err(USAGE.into());
    }
    Ok(settings)
}

/// Every audio track after the first `audible` is muted, so the same project
/// can be measured at one track and at all of them.
fn with_audio_tracks(project: &Project, audible: usize) -> Project {
    let mut copy = project.clone();
    let mut seen = 0;
    for track in copy.tracks.iter_mut() {
        if track.kind != TrackKind::Audio {
            continue;
        }
        seen += 1;
        track.muted = seen > audible;
    }
    copy
}

fn audio_tracks(project: &Project) -> usize {
    project
        .tracks
        .iter()
        .filter(|track| track.kind == TrackKind::Audio)
        .count()
}

fn ffmpeg() -> String {
    std::env::var("FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

/// Build an engine, run one scenario on it, and take it down again. A scenario
/// per engine rather than one engine for all of them, so a scenario cannot be
/// helped by queues the one before it left warm.
fn run_scenario(project: &Project, settings: &Settings, scenario: &Scenario) -> ScenarioReport {
    let (engine, consumer, clock) = Engine::start(
        project,
        Buffering::new(settings.depth, settings.lead),
        Arc::new(FfmpegReaders::new(&ffmpeg())),
        Options::default(),
    );
    measure(&engine, &consumer, &clock, scenario)
}

fn run() -> Result<Run, String> {
    let settings = parse(std::env::args())?;
    let text = std::fs::read_to_string(&settings.project)
        .map_err(|error| format!("cannot read {}: {error}", settings.project))?;
    let project: Project =
        serde_json::from_str(&text).map_err(|error| format!("that is not a project: {error}"))?;
    let rate = project.rate();
    if project.duration_frames() == 0 {
        return Err("the timeline is empty, there is nothing to play".into());
    }
    let frames = (settings.seconds * f64::from(ENGINE_HZ)).round().max(1.0) as u64;
    let tracks = audio_tracks(&project);

    let mut scenarios: Vec<ScenarioReport> = Vec::new();

    // Straight through, which is where a queue that is too shallow shows.
    let one = with_audio_tracks(&project, 1);
    scenarios.push(run_scenario(
        &one,
        &settings,
        &Scenario::new("continuous-playback", frames).noting("audioTracks", "1".into()),
    ));

    // Seeks, which is where a refill that is too slow shows. Both are the same
    // operation inside the engine: flush the ring, empty the queues, fill them
    // from the target.
    let every = (settings.seek_every_seconds * f64::from(ENGINE_HZ))
        .round()
        .max(1.0) as u64;
    scenarios.push(run_scenario(
        &one,
        &settings,
        &Scenario::new("repeated-seek", frames)
            .seeking(every, 0)
            .noting("audioTracks", "1".into()),
    ));

    // And once per track count, because a decoder is per clip and mixing is
    // the axis a track count trades against.
    for audible in 2..=tracks {
        let some = with_audio_tracks(&project, audible);
        scenarios.push(run_scenario(
            &some,
            &settings,
            &Scenario::new("increasing-track-count", frames)
                .noting("audioTracks", audible.to_string()),
        ));
    }

    let mut config = BTreeMap::new();
    config.insert("depth".into(), settings.depth.to_string());
    config.insert("lead".into(), settings.lead.to_string());
    config.insert("seconds".into(), settings.seconds.to_string());
    config.insert(
        "seekEverySeconds".into(),
        settings.seek_every_seconds.to_string(),
    );
    config.insert("audioTracks".into(), tracks.to_string());

    let report = Run::new(ProjectInfo::new(rate), config, scenarios);
    if let Some(path) = &settings.report {
        let json = serde_json::to_string_pretty(&report)
            .map_err(|error| format!("cannot write the report: {error}"))?;
        std::fs::write(path, json).map_err(|error| format!("cannot write {path}: {error}"))?;
    }
    Ok(report)
}

fn main() {
    // Asking for the help is not a failure, and a script that treats a non-zero
    // exit as one would call it a failure.
    if std::env::args().any(|argument| argument == "--help" || argument == "-h") {
        println!("{USAGE}");
        return;
    }
    match run() {
        Ok(report) => {
            let json = match serde_json::to_string_pretty(&report) {
                Ok(json) => json,
                Err(error) => {
                    eprintln!("cannot serialize the report: {error}");
                    std::process::exit(2);
                }
            };
            println!("{json}");
            for scenario in &report.scenarios {
                eprintln!(
                    "{:<24} {:>9} frames  underruns {:<5} p99 {:>6.1} ms  drift {:>6.1} ms  {}",
                    scenario.scenario,
                    scenario.metrics.played_frames,
                    scenario.metrics.underruns,
                    scenario.metrics.buffer_interval_p99_ms.unwrap_or(0.0),
                    scenario.metrics.drift_ms,
                    if scenario.evaluation.pass {
                        "pass"
                    } else {
                        "FAIL"
                    }
                );
            }
            if !report.pass {
                std::process::exit(1);
            }
        }
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    }
}
