//! The composited render, end to end, against a real ffmpeg.
//!
//! The unit tests in the crate prove the shader draws what it is told to. This
//! proves the whole route: decoders started per clip, frames read in step with
//! the timeline, the composite written to an encoder on a pipe, and a playable
//! file at the other end with the right pixels in it.
//!
//! It needs ffmpeg. A graphics device is optional — `Compositor::new()` falls
//! back to the software backend — so this runs the whole pipeline either way,
//! and the verify job installs a software Vulkan device so the GPU half is
//! exercised too. A render path nobody has run is the thing this crate exists
//! to avoid.

use makevideo_compositor::{pipeline, Compositor};
use makevideo_render::{
    ffmpeg, Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind,
};
use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

/// The editing canvas the fixtures use. The rendered file is bigger than this:
/// a preset sets the long edge, so a 16:9 project comes out 1920x1080 whatever
/// the canvas was. Every check below reads the size back rather than assuming.
const CANVAS_W: u32 = 320;
const CANVAS_H: u32 = 180;

fn output_size() -> (u32, u32) {
    ffmpeg::output_size(
        &ProjectSettings {
            width: CANVAS_W,
            height: CANVAS_H,
            fps: 30,
        },
        ffmpeg::Preset::Fhd,
    )
}

fn ffmpeg_path() -> String {
    std::env::var("FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

fn temp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("makevideo-render-test");
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

/// A solid colour clip of a given size, so the composite can be checked by
/// reading one pixel.
fn make_video(
    name: &str,
    colour: &str,
    width: u32,
    height: u32,
    seconds: f32,
    sound: bool,
) -> String {
    let path = temp_dir().join(name);
    if path.exists() {
        return path.to_string_lossy().to_string();
    }
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        format!("color=c={colour}:s={width}x{height}:d={seconds}:r=30"),
    ];
    if sound {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            format!("sine=frequency=440:duration={seconds}"),
            "-c:a".into(),
            "aac".into(),
        ]);
    } else {
        args.push("-an".into());
    }
    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-shortest".into(),
        path.to_string_lossy().to_string(),
    ]);
    let status = Command::new(ffmpeg_path())
        .args(&args)
        .status()
        .expect("ffmpeg is needed for this test");
    assert!(status.success(), "could not build the {name} fixture");
    path.to_string_lossy().to_string()
}

fn asset(id: &str, path: &str, width: u32, height: u32, has_audio: bool) -> Asset {
    Asset {
        id: id.into(),
        path: path.into(),
        name: id.into(),
        kind: AssetKind::Video,
        duration_ms: 4000,
        width,
        height,
        has_audio,
    }
}

fn clip(id: &str, asset_id: &str, start_ms: u64, out_ms: u64) -> Clip {
    Clip {
        id: id.into(),
        asset_id: asset_id.into(),
        start_ms,
        in_ms: 0,
        out_ms,
        volume: 1.0,
        opacity: 1.0,
    }
}

fn track(id: &str, kind: TrackKind, clips: Vec<Clip>) -> Track {
    Track {
        id: id.into(),
        kind,
        name: id.into(),
        clips,
        muted: false,
        hidden: false,
    }
}

/// Reads one pixel out of a decoded frame at `seconds`.
fn pixel_at(file: &str, seconds: f32, x: u32, y: u32) -> (u8, u8, u8) {
    let (width, height) = output_size();
    let output = Command::new(ffmpeg_path())
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            &seconds.to_string(),
            "-i",
            file,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ])
        .output()
        .expect("ffmpeg");
    let expected = (width * height * 3) as usize;
    assert_eq!(
        output.stdout.len(),
        expected,
        "frame at {seconds}s was {} bytes, wanted {expected}",
        output.stdout.len()
    );
    let index = ((y * width + x) * 3) as usize;
    (
        output.stdout[index],
        output.stdout[index + 1],
        output.stdout[index + 2],
    )
}

fn near(got: (u8, u8, u8), want: (u8, u8, u8)) -> bool {
    let diff = |a: u8, b: u8| (a as i32 - b as i32).abs();
    diff(got.0, want.0) <= 48 && diff(got.1, want.1) <= 48 && diff(got.2, want.2) <= 48
}

fn render(project: &Project, output: &str) -> Result<(), String> {
    let compositor = Compositor::new();
    let slot = Arc::new(Mutex::new(None));
    let cancelled = Arc::new(AtomicBool::new(false));
    let mut seen: Vec<u64> = Vec::new();
    let result = pipeline::run(
        &compositor,
        pipeline::Options {
            ffmpeg: &ffmpeg_path(),
            project,
            output,
            preset: ffmpeg::Preset::Fhd,
            accel: None,
        },
        &slot,
        &cancelled,
        |position, _total| seen.push(position),
    );
    if result.is_ok() {
        assert!(!seen.is_empty(), "a render should report progress");
        assert!(
            seen.windows(2).all(|pair| pair[1] >= pair[0]),
            "progress went backwards: {seen:?}"
        );
    }
    result
}

/// A 16:9 clip under a 4:3 one. The middle must be the upper clip and the
/// sides must show the one underneath through its transparent letterbox — the
/// same thing the ffmpeg filter graph was checked for, now proved for the
/// route that draws it on the GPU instead.
#[test]
fn two_tracks_composite_the_way_the_timeline_says() {
    let wide = make_video("wide-red.mp4", "red", 320, 180, 4.0, true);
    let narrow = make_video("narrow-green.mp4", "green", 160, 120, 4.0, false);
    let project = Project {
        settings: ProjectSettings {
            width: CANVAS_W,
            height: CANVAS_H,
            fps: 30,
        },
        assets: vec![
            asset("wide", &wide, 320, 180, true),
            asset("narrow", &narrow, 160, 120, false),
        ],
        tracks: vec![
            track("V1", TrackKind::Video, vec![clip("c1", "wide", 0, 2000)]),
            track(
                "V2",
                TrackKind::Video,
                vec![clip("c2", "narrow", 1000, 2000)],
            ),
        ],
    };
    let output = temp_dir()
        .join("composited.mp4")
        .to_string_lossy()
        .to_string();
    render(&project, &output).expect("the render should succeed");

    let (out_w, out_h) = output_size();
    let (centre, middle) = (out_w / 2, out_h / 2);
    // Before the upper clip starts, the whole frame is the lower one.
    assert!(
        near(pixel_at(&output, 0.5, centre, middle), (255, 0, 0)),
        "at 0.5s the frame should be the bottom clip"
    );
    // While both are on, the middle is the upper clip.
    assert!(
        near(pixel_at(&output, 1.5, centre, middle), (0, 128, 0)),
        "at 1.5s the middle should be the top clip"
    );
    // And its pillarbox is transparent, so the lower clip shows at the edges.
    assert!(
        near(pixel_at(&output, 1.5, 8, middle), (255, 0, 0)),
        "at 1.5s the sides should show the bottom clip through the pad"
    );
    // After the lower clip ends, the sides fall through to the black base.
    assert!(
        near(pixel_at(&output, 2.5, 8, middle), (0, 0, 0)),
        "at 2.5s the sides should be the base"
    );
    assert!(
        near(pixel_at(&output, 2.5, centre, middle), (0, 128, 0)),
        "at 2.5s the middle should still be the top clip"
    );
}

#[test]
fn the_output_is_the_length_the_timeline_says_with_the_sound_on_it() {
    let wide = make_video("wide-red.mp4", "red", 320, 180, 4.0, true);
    let project = Project {
        settings: ProjectSettings {
            width: CANVAS_W,
            height: CANVAS_H,
            fps: 30,
        },
        assets: vec![asset("wide", &wide, 320, 180, true)],
        tracks: vec![track(
            "V1",
            TrackKind::Video,
            vec![clip("c1", "wide", 0, 3000)],
        )],
    };
    let output = temp_dir().join("length.mp4").to_string_lossy().to_string();
    render(&project, &output).expect("the render should succeed");

    let probe = Command::new(std::env::var("FFPROBE").unwrap_or_else(|_| "ffprobe".into()))
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height",
            "-of",
            "default=noprint_wrappers=1",
            &output,
        ])
        .output()
        .expect("ffprobe");
    let text = String::from_utf8_lossy(&probe.stdout);
    let (out_w, out_h) = output_size();
    assert!(text.contains(&format!("width={out_w}")), "{text}");
    assert!(text.contains(&format!("height={out_h}")), "{text}");
    assert!(
        text.contains("codec_type=audio"),
        "audio is still mixed by ffmpeg: {text}"
    );
    let seconds: f32 = text
        .lines()
        .find_map(|line| line.strip_prefix("duration="))
        .and_then(|value| value.parse().ok())
        .expect("a duration");
    assert!(
        (seconds - 3.0).abs() < 0.15,
        "the file is {seconds}s, the timeline is 3s"
    );
}

/// A clip whose file has gone draws nothing instead of failing the render,
/// which is the same thing the timeline shows for it.
#[test]
fn a_missing_source_leaves_a_hole_rather_than_an_error() {
    let wide = make_video("wide-red.mp4", "red", 320, 180, 4.0, true);
    let project = Project {
        settings: ProjectSettings {
            width: CANVAS_W,
            height: CANVAS_H,
            fps: 30,
        },
        assets: vec![
            asset("wide", &wide, 320, 180, true),
            asset("gone", "/nowhere/at/all.mp4", 320, 180, false),
        ],
        tracks: vec![
            track("V1", TrackKind::Video, vec![clip("c1", "wide", 0, 2000)]),
            track("V2", TrackKind::Video, vec![clip("c2", "gone", 0, 2000)]),
        ],
    };
    let output = temp_dir().join("missing.mp4").to_string_lossy().to_string();
    render(&project, &output).expect("a missing file must not fail the render");
    assert!(
        near(
            pixel_at(&output, 1.0, output_size().0 / 2, output_size().1 / 2),
            (255, 0, 0)
        ),
        "the clip that is still there should draw"
    );
}

/// The preview frame is drawn by the same compositor and the same geometry, so
/// it has to match the frame the render puts in the file at that instant.
#[test]
fn the_preview_frame_matches_the_rendered_frame() {
    let wide = make_video("wide-red.mp4", "red", 320, 180, 4.0, true);
    let narrow = make_video("narrow-green.mp4", "green", 160, 120, 4.0, false);
    let project = Project {
        settings: ProjectSettings {
            width: CANVAS_W,
            height: CANVAS_H,
            fps: 30,
        },
        assets: vec![
            asset("wide", &wide, 320, 180, true),
            asset("narrow", &narrow, 160, 120, false),
        ],
        tracks: vec![
            track("V1", TrackKind::Video, vec![clip("c1", "wide", 0, 3000)]),
            track(
                "V2",
                TrackKind::Video,
                vec![clip("c2", "narrow", 1000, 2000)],
            ),
        ],
    };
    let output = temp_dir().join("match.mp4").to_string_lossy().to_string();
    render(&project, &output).expect("the render should succeed");

    let compositor = Compositor::new();
    let (out_w, out_h) = output_size();
    let preview =
        pipeline::preview_frame(&compositor, &ffmpeg_path(), &project, 1500, out_w, out_h)
            .expect("a preview frame");
    assert_eq!(preview.len(), (out_w * out_h * 4) as usize);

    for (x, what) in [(out_w / 2, "the middle"), (8, "the left edge")] {
        let index = (((out_h / 2) * out_w + x) * 4) as usize;
        let shown = (preview[index], preview[index + 1], preview[index + 2]);
        let encoded = pixel_at(&output, 1.5, x, out_h / 2);
        assert!(
            near(shown, encoded),
            "{what}: the preview shows {shown:?} and the render wrote {encoded:?}"
        );
    }
}
