//! Measures the frame source against real media, with no window anywhere.
//!
//! ```text
//! cargo run -p makevideo-compositor --bin supply-soak -- \
//!   /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 60
//! ```
//!
//! It prints the report the page harness writes, in the same shape, and exits
//! non-zero when a scenario fails. That exit code is the whole point: the
//! supply layer has a pass mark now, and it is checked by running it rather
//! than by watching it.

use makevideo_compositor::source::{Buffering, FfmpegReaders, FrameSource};
use makevideo_compositor::supply::{measure, ProjectInfo, Run, Scenario, ScenarioReport};
use makevideo_render::{ffmpeg, layout, Project, TrackKind};
use std::collections::BTreeMap;
use std::sync::Arc;

struct Options {
    project: String,
    seconds: f64,
    depth: usize,
    lead: i64,
    preset: ffmpeg::Preset,
    seek_every_seconds: f64,
    report: Option<String>,
}

const USAGE: &str = "\
usage: supply-soak <project.akbunvideo> [options]

  --seconds N        how long each scenario runs (default 30)
  --depth N          frames buffered per clip (default 6)
  --lead N           frames of head start for a decoder (default 15)
  --preset fhd|4k    the output size to decode for (default fhd)
  --seek-every N     seconds between seeks in the seek scenario (default 2)
  --report PATH      also write the report as JSON
  --help
";

fn parse(mut args: std::env::Args) -> Result<Options, String> {
    args.next();
    let mut options = Options {
        project: String::new(),
        seconds: 30.0,
        depth: makevideo_compositor::source::DEFAULT_DEPTH,
        lead: makevideo_compositor::source::DEFAULT_LEAD,
        preset: ffmpeg::Preset::Fhd,
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
                options.seconds = value()?
                    .parse()
                    .map_err(|_| "--seconds wants a number".to_string())?
            }
            "--depth" => {
                options.depth = value()?
                    .parse()
                    .map_err(|_| "--depth wants a number".to_string())?
            }
            "--lead" => {
                options.lead = value()?
                    .parse()
                    .map_err(|_| "--lead wants a number".to_string())?
            }
            "--preset" => options.preset = ffmpeg::Preset::parse(&value()?)?,
            "--seek-every" => {
                options.seek_every_seconds = value()?
                    .parse()
                    .map_err(|_| "--seek-every wants a number".to_string())?
            }
            "--report" => options.report = Some(value()?),
            other if other.starts_with('-') => return Err(format!("unknown option {other}")),
            other => options.project = other.to_string(),
        }
    }
    if options.project.is_empty() {
        return Err(USAGE.into());
    }
    Ok(options)
}

/// Every video track after the first is hidden, so the same project can be
/// measured at one track and at all of them. The generated quality project is
/// already built this way.
fn with_video_tracks(project: &Project, visible: usize) -> Project {
    let mut copy = project.clone();
    let mut seen = 0;
    for track in copy.tracks.iter_mut() {
        if track.kind != TrackKind::Video {
            continue;
        }
        seen += 1;
        track.hidden = seen > visible;
    }
    copy
}

fn video_tracks(project: &Project) -> usize {
    project
        .tracks
        .iter()
        .filter(|track| track.kind == TrackKind::Video)
        .count()
}

fn build(project: &Project, options: &Options) -> FrameSource {
    let (width, height) = ffmpeg::output_size(&project.settings, options.preset);
    FrameSource::new(
        project,
        width,
        height,
        Buffering::new(options.depth, options.lead),
        Arc::new(FfmpegReaders::new(
            &std::env::var("FFMPEG").unwrap_or_else(|_| "ffmpeg".into()),
            None,
        )),
    )
}

fn run() -> Result<Run, String> {
    let options = parse(std::env::args())?;
    let text = std::fs::read_to_string(&options.project)
        .map_err(|error| format!("cannot read {}: {error}", options.project))?;
    let project: Project =
        serde_json::from_str(&text).map_err(|error| format!("that is not a project: {error}"))?;
    let rate = project.rate();
    let frames = (options.seconds * rate.as_f64()).round().max(1.0) as u64;
    if layout::frame_count(&project) == 0 {
        return Err("the timeline is empty, there is nothing to supply".into());
    }
    let tracks = video_tracks(&project);
    let (width, height) = ffmpeg::output_size(&project.settings, options.preset);

    let mut scenarios: Vec<ScenarioReport> = Vec::new();

    // Straight through, which is where a buffer that is too shallow shows.
    let mut source = build(&with_video_tracks(&project, 1), &options);
    scenarios.push(measure(
        &mut source,
        &Scenario::new("continuous-supply", frames).noting("videoTracks", "1".into()),
    ));
    drop(source);

    // Seeks, which is where a refill that is too slow shows. Both are the same
    // operation inside the source: empty the queues, fill them from the target.
    let mut source = build(&with_video_tracks(&project, 1), &options);
    let every = (options.seek_every_seconds * rate.as_f64())
        .round()
        .max(1.0) as u64;
    scenarios.push(measure(
        &mut source,
        &Scenario::new("repeated-seek", frames)
            .seeking(every, 0)
            .noting("videoTracks", "1".into()),
    ));
    drop(source);

    // And once per track count, because the cost of a frame is per clip on
    // screen and this is the axis the buffering settings trade against.
    for visible in 2..=tracks {
        let mut source = build(&with_video_tracks(&project, visible), &options);
        scenarios.push(measure(
            &mut source,
            &Scenario::new("increasing-track-count", frames)
                .noting("videoTracks", visible.to_string()),
        ));
    }

    let mut config = BTreeMap::new();
    config.insert("depth".into(), options.depth.to_string());
    config.insert("lead".into(), options.lead.to_string());
    config.insert("preset".into(), options.preset.label().to_string());
    config.insert("seconds".into(), options.seconds.to_string());
    config.insert(
        "seekEverySeconds".into(),
        options.seek_every_seconds.to_string(),
    );
    config.insert("outputSize".into(), format!("{width}x{height}"));

    let report = Run::new(ProjectInfo::new(width, height, rate), config, scenarios);
    if let Some(path) = &options.report {
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
                    "{:<24} {:>5} frames  p50 {:>6.1} ms  p99 {:>6.1} ms  late {:<5} {}",
                    scenario.scenario,
                    scenario.metrics.total_frames,
                    scenario.metrics.frame_interval_p50_ms.unwrap_or(0.0),
                    scenario.metrics.frame_interval_p99_ms.unwrap_or(0.0),
                    scenario.metrics.late_frames,
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
