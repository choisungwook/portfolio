//! Measures the playback scheduler against real media, with no window.
//!
//! ```text
//! cargo run -p makevideo-present --bin present-soak -- \
//!   /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 30
//! ```
//!
//! The third meter. `supply-soak` asks whether frames arrive in time and
//! `audio-soak` whether the sound is continuous; this one runs both at once and
//! asks the question neither of them can see — whether the frame on screen
//! matches the sound coming out. It exits non-zero when a scenario misses its
//! limits, which is what makes "the picture is in sync" a thing that is checked
//! rather than a thing somebody says.
//!
//! No window is opened on purpose, and it costs less than it looks. The sound
//! goes to a thread with a stopwatch, which is what a device does; the picture
//! is composited on the real graphics device and then dropped instead of
//! presented. Everything that decides *when* is the same code the app runs.

use makevideo_audio::engine::Options as AudioOptions;
use makevideo_audio::source::{
    Buffering as AudioBuffering, FfmpegReaders as AudioReaders, DEFAULT_DEPTH as AUDIO_DEPTH,
    DEFAULT_LEAD as AUDIO_LEAD,
};
use makevideo_compositor::source::{
    Buffering as FrameBuffering, FfmpegReaders as FrameReaders, DEFAULT_DEPTH as FRAME_DEPTH,
    DEFAULT_LEAD as FRAME_LEAD,
};
use makevideo_compositor::{Backend, Compositor};
use makevideo_present::schedule::DEFAULT_RESYNC;
use makevideo_present::sink::OffscreenSink;
use makevideo_present::soak::{measure, ProjectInfo, Run, Scenario, ScenarioReport};
use makevideo_present::transport::{Setup, Transport};
use makevideo_render::{ffmpeg, Project, TrackKind};
use std::collections::BTreeMap;
use std::sync::Arc;

struct Settings {
    project: String,
    seconds: f64,
    frame_depth: usize,
    frame_lead: i64,
    audio_depth: usize,
    audio_lead: i64,
    resync: i64,
    preset: ffmpeg::Preset,
    backend: Backend,
    seek_every_seconds: f64,
    report: Option<String>,
}

const USAGE: &str = "\
usage: present-soak <project.akbunvideo> [options]

  --seconds N        how long each scenario runs (default 30)
  --depth N          frames buffered per clip (default 6)
  --lead N           frames of head start for a video decoder (default 15)
  --audio-depth N    blocks buffered per audible clip (default 8)
  --audio-lead N     engine samples of head start for an audio decoder
  --resync N         frames behind the clock before the picture jumps (default 15)
  --preset fhd|4k    output size (default fhd)
  --backend auto|gpu|cpu   which compositor draws (default auto)
  --seek-every N     seconds between seeks in the seek scenario (default 2)
  --report PATH      also write the report as JSON
  --help
";

fn parse(mut args: std::env::Args) -> Result<Settings, String> {
    args.next();
    let mut settings = Settings {
        project: String::new(),
        seconds: 30.0,
        frame_depth: FRAME_DEPTH,
        frame_lead: FRAME_LEAD,
        audio_depth: AUDIO_DEPTH,
        audio_lead: AUDIO_LEAD,
        resync: DEFAULT_RESYNC,
        preset: ffmpeg::Preset::Fhd,
        backend: Backend::Auto,
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
                settings.frame_depth = value()?
                    .parse()
                    .map_err(|_| "--depth wants a number".to_string())?
            }
            "--lead" => {
                settings.frame_lead = value()?
                    .parse()
                    .map_err(|_| "--lead wants a number".to_string())?
            }
            "--audio-depth" => {
                settings.audio_depth = value()?
                    .parse()
                    .map_err(|_| "--audio-depth wants a number".to_string())?
            }
            "--audio-lead" => {
                settings.audio_lead = value()?
                    .parse()
                    .map_err(|_| "--audio-lead wants a number".to_string())?
            }
            "--resync" => {
                settings.resync = value()?
                    .parse()
                    .map_err(|_| "--resync wants a number".to_string())?
            }
            "--preset" => settings.preset = ffmpeg::Preset::parse(&value()?)?,
            "--backend" => settings.backend = Backend::parse(&value()?),
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

/// Every video track after the first `visible` is hidden, so one project
/// measures at one track and at all of them. The same helper the supply meter
/// uses, and the same scenario name, so the two reports line up.
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

fn ffmpeg_path() -> String {
    std::env::var("FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

/// A transport per scenario, taken down again after it. A scenario helped by
/// queues the one before it left warm is not a measurement.
fn run_scenario(
    project: &Project,
    settings: &Settings,
    compositor: &Arc<Compositor>,
    scenario: &Scenario,
) -> ScenarioReport {
    let (width, height) = ffmpeg::output_size(&project.settings, settings.preset);
    let (mut transport, consumer) = Transport::start(Setup {
        project,
        width,
        height,
        frame_buffering: FrameBuffering::new(settings.frame_depth, settings.frame_lead),
        frame_readers: Arc::new(FrameReaders::new(&ffmpeg_path(), None)),
        audio_buffering: AudioBuffering::new(settings.audio_depth, settings.audio_lead),
        audio_readers: Arc::new(AudioReaders::new(&ffmpeg_path())),
        audio: AudioOptions::default(),
        resync_after: settings.resync,
    });
    let clock = Arc::clone(transport.audio().clock());
    let mut sink = OffscreenSink::new(Arc::clone(compositor), width, height);
    measure(&mut transport, consumer, clock, &mut sink, scenario)
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

    let compositor = Arc::new(
        Compositor::with_backend(settings.backend)
            .map_err(|error| format!("cannot open a compositor: {error}"))?,
    );
    let frames = (settings.seconds * rate.as_f64()).round().max(1.0) as u64;
    let tracks = video_tracks(&project);
    let (width, height) = ffmpeg::output_size(&project.settings, settings.preset);

    let mut scenarios: Vec<ScenarioReport> = Vec::new();

    // Straight through, which is where a scheduler that drifts shows.
    let one = with_video_tracks(&project, 1);
    scenarios.push(run_scenario(
        &one,
        &settings,
        &compositor,
        &Scenario::new("continuous-playback", frames).noting("videoTracks", "1".into()),
    ));

    // Seeks, which is where the two halves landing in different places shows.
    let every = (settings.seek_every_seconds * rate.as_f64()).round().max(1.0) as u64;
    scenarios.push(run_scenario(
        &one,
        &settings,
        &compositor,
        &Scenario::new("repeated-seek", frames)
            .seeking(every, 0)
            .noting("videoTracks", "1".into()),
    ));

    // And once per track count: a layer is a decoder and a draw call, so this
    // is the axis both halves of a frame's cost grow on.
    for visible in 2..=tracks {
        let some = with_video_tracks(&project, visible);
        scenarios.push(run_scenario(
            &some,
            &settings,
            &compositor,
            &Scenario::new("increasing-track-count", frames)
                .noting("videoTracks", visible.to_string()),
        ));
    }

    let mut config = BTreeMap::new();
    config.insert("depth".into(), settings.frame_depth.to_string());
    config.insert("lead".into(), settings.frame_lead.to_string());
    config.insert("audioDepth".into(), settings.audio_depth.to_string());
    config.insert("audioLead".into(), settings.audio_lead.to_string());
    config.insert("resync".into(), settings.resync.to_string());
    config.insert("seconds".into(), settings.seconds.to_string());
    config.insert(
        "seekEverySeconds".into(),
        settings.seek_every_seconds.to_string(),
    );
    config.insert("videoTracks".into(), tracks.to_string());
    config.insert("compositor".into(), compositor.adapter().to_string());
    config.insert("gpu".into(), compositor.is_gpu().to_string());

    let report = Run::new(
        ProjectInfo::new(width, height, rate),
        config,
        scenarios,
    );
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
                    "{:<24} {:>6} shown  skipped {:<5} jumps {:<4} drift p99 {:>6.1} ms  gap p99 {:>6.1} ms  {}",
                    scenario.scenario,
                    scenario.metrics.presented_frames,
                    scenario.metrics.skipped_frames,
                    scenario.metrics.resyncs,
                    scenario.metrics.av_drift_p99_ms.unwrap_or(0.0),
                    scenario.metrics.present_interval_p99_ms.unwrap_or(0.0),
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
