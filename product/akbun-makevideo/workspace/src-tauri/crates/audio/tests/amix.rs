//! The playback mix against the render's mix, sample by sample, with a real
//! ffmpeg on both sides.
//!
//! The unit tests in the crate prove the mixer adds where it says it adds. This
//! proves the thing that actually matters: that what comes out of the speakers
//! while editing is what comes out of the file afterwards. If those two ever
//! part company, every judgement made while editing is made about a mix nobody
//! will ever hear — a level set by ear, a clip trimmed because it clashed — and
//! nothing in the interface would say so.
//!
//! The sources are deliberately at **different sample rates**. That is where a
//! second resampler, or a delay computed in milliseconds instead of samples,
//! stops being invisible: a project where everything is already 48 kHz would
//! pass with the offsets computed almost any way at all.
//!
//! It needs ffmpeg. The verify job installs one, and so does anybody rendering
//! with this app.

use makevideo_audio::engine::{Engine, Options};
use makevideo_audio::realtime::{CHANNELS, ENGINE_HZ};
use makevideo_audio::source::{Buffering, FfmpegReaders};
use makevideo_render::{
    ffmpeg, Asset, AssetKind, Clip, Project, ProjectSettings, Rate, Track, TrackKind,
    FORMAT_VERSION,
};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};

fn ffmpeg_path() -> String {
    std::env::var("FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

fn temp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("makevideo-audio-test");
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

/// A steady tone as a wav, at whatever rate is asked for.
///
/// A tone rather than noise because a resampler is allowed to differ in the
/// last bits on a broadband signal and is not allowed to move a sine.
///
/// The `volume` is not decoration. lavfi's `sine` comes out around -21 dB, and
/// comparing two nearly silent mixes would pass however wrong the mixing was.
fn make_tone(name: &str, hz: u32, sample_rate: u32, seconds: f32) -> String {
    let path = temp_dir().join(name);
    let text = path.to_string_lossy().to_string();
    let status = Command::new(ffmpeg_path())
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            &format!("sine=frequency={hz}:sample_rate={sample_rate}:duration={seconds}"),
            "-af",
            "volume=10",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            &text,
        ])
        .status()
        .expect("ffmpeg should be installed to run this test");
    assert!(status.success(), "could not make {text}");
    text
}

fn asset(id: &str, path: &str) -> Asset {
    Asset {
        id: id.into(),
        path: path.into(),
        name: id.into(),
        kind: AssetKind::Audio,
        duration_ms: 4_000,
        width: 0,
        height: 0,
        has_audio: true,
    }
}

fn clip(id: &str, asset_id: &str, start: i64, in_point: i64, out_point: i64, volume: f32) -> Clip {
    Clip {
        id: id.into(),
        asset_id: asset_id.into(),
        start,
        in_point,
        out_point,
        volume,
        opacity: 1.0,
    }
}

fn audio_track(id: &str, clips: Vec<Clip>) -> Track {
    Track {
        id: id.into(),
        kind: TrackKind::Audio,
        name: id.into(),
        clips,
        muted: false,
        hidden: false,
    }
}

/// Two clips at different levels, overlapping, from sources at 44.1 kHz and
/// 48 kHz, with one of them starting off a whole second.
///
/// The volumes are deliberately awkward numbers. Round ones like 0.8 survive
/// any amount of quantising on the way to the filter graph, so they would let a
/// gain that the file applies differently from playback go unnoticed.
fn project(rate: Rate, a: &str, b: &str) -> Project {
    Project {
        version: FORMAT_VERSION,
        settings: ProjectSettings {
            width: 1920,
            height: 1080,
            rate,
        },
        assets: vec![asset("a1", a), asset("a2", b)],
        tracks: vec![
            audio_track("A1", vec![clip("c1", "a1", 0, 15, 75, 0.333_5)]),
            audio_track("A2", vec![clip("c2", "a2", 23, 0, 60, 0.707_9)]),
        ],
    }
}

/// The render's mix, decoded straight to samples so no encoder sits between the
/// two answers.
///
/// `name` is per test because these run on threads of one process, and a shared
/// output file makes one test read the other one's mix. That failure looks
/// exactly like the mixing being wrong, which cost a while to see.
fn reference(project: &Project, name: &str) -> Vec<f32> {
    let path = temp_dir().join(name);
    let text = path.to_string_lossy().to_string();
    let args = ffmpeg::mix_reference_args(project, &text).expect("the project has sound in it");
    let status = Command::new(ffmpeg_path())
        .args(&args)
        .status()
        .expect("ffmpeg should be installed to run this test");
    assert!(status.success(), "the reference mix failed: {args:?}");
    let bytes = std::fs::read(&path).expect("the reference mix wrote nothing");
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// The playback mix, played out through the engine exactly as a device would
/// take it.
fn played(project: &Project) -> Vec<f32> {
    let (engine, consumer, clock) = Engine::start(
        project,
        Buffering::default(),
        Arc::new(FfmpegReaders::new(&ffmpeg_path())),
        Options::default(),
    );
    let total = engine.total_samples() as usize;
    let mut out = Vec::with_capacity(total * CHANNELS);
    let mut buffer = vec![0.0f32; 512 * CHANNELS];
    let deadline = Instant::now() + Duration::from_secs(120);
    while out.len() / CHANNELS < total && Instant::now() < deadline {
        let taken = consumer.pop(&mut buffer);
        clock.advance(taken as u64);
        if taken == 0 {
            std::thread::sleep(Duration::from_millis(1));
            continue;
        }
        out.extend_from_slice(&buffer[..taken * CHANNELS]);
    }
    assert_eq!(
        out.len() / CHANNELS,
        total,
        "playback did not produce the whole timeline"
    );
    out
}

/// Loudest disagreement, and where it was.
fn worst(a: &[f32], b: &[f32]) -> (f32, usize) {
    a.iter()
        .zip(b.iter())
        .enumerate()
        .map(|(index, (left, right))| ((left - right).abs(), index))
        .fold((0.0f32, 0usize), |worst, next| {
            if next.0 > worst.0 {
                next
            } else {
                worst
            }
        })
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f64 = samples.iter().map(|s| f64::from(*s) * f64::from(*s)).sum();
    (sum / samples.len() as f64).sqrt() as f32
}

#[test]
fn the_mix_that_plays_is_the_mix_that_renders() {
    let a = make_tone("tone-44100.wav", 440, 44_100, 4.0);
    let b = make_tone("tone-48000.wav", 660, 48_000, 4.0);
    let project = project(Rate::fps(30), &a, &b);

    let reference = reference(&project, "reference-30.f32");
    let played = played(&project);

    // The render is bounded by `-t`, which rounds to the sample, so the two can
    // differ by one frame at the very end. Anything more than that is a length
    // that was worked out twice.
    let difference = (reference.len() as i64 - played.len() as i64).abs();
    assert!(
        difference <= CHANNELS as i64,
        "the render mixed {} samples and playback mixed {}",
        reference.len(),
        played.len()
    );

    let shared = reference.len().min(played.len());
    assert!(shared > 3 * ENGINE_HZ as usize, "the test mixed almost nothing");
    let level = rms(&played[..shared]);
    assert!(
        level > 0.1,
        "the mix came out at {level}, too quiet for the comparison below to mean anything"
    );

    let (worst, at) = worst(&reference[..shared], &played[..shared]);
    // Both sides ran the same source through the same filter, applied the same
    // volume and placed it at the same sample, so what is left is float
    // rounding in a different order.
    assert!(
        worst < 1e-4,
        "the two mixes differ by {worst} at sample {} of {}",
        at / CHANNELS,
        shared / CHANNELS
    );
}

#[test]
fn a_broadcast_rate_puts_the_sound_in_the_same_place_in_both() {
    // 29.97 is where an offset computed in milliseconds rather than samples
    // drifts, and where a clip's end derived from its length rather than from
    // the timeline slips by a sample per clip. Neither shows at 30.
    let a = make_tone("tone-ntsc-44100.wav", 440, 44_100, 4.0);
    let b = make_tone("tone-ntsc-48000.wav", 660, 48_000, 4.0);
    let project = project(Rate::ntsc(30), &a, &b);

    let reference = reference(&project, "reference-ntsc.f32");
    let played = played(&project);
    let shared = reference.len().min(played.len());
    assert!(shared > 3 * ENGINE_HZ as usize);

    let (worst, at) = worst(&reference[..shared], &played[..shared]);
    assert!(
        worst < 1e-4,
        "the two mixes differ by {worst} at sample {} of {}",
        at / CHANNELS,
        shared / CHANNELS
    );
}

#[test]
fn a_project_with_nothing_audible_has_no_reference_to_compare_against() {
    // Not a mixing check: a check that both sides agree there is nothing to
    // mix, which is the other half of "the same clips".
    let a = make_tone("tone-silent-a.wav", 440, 48_000, 1.0);
    let b = make_tone("tone-silent-b.wav", 660, 48_000, 1.0);
    let mut project = project(Rate::fps(30), &a, &b);
    for track in project.tracks.iter_mut() {
        track.muted = true;
    }
    assert!(ffmpeg::mix_reference_args(&project, "/tmp/nothing.f32").is_none());
    assert!(makevideo_audio::mix::regions(&project).is_empty());
}
