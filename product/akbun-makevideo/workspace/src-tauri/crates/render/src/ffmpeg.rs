//! Turning a project into an ffmpeg argument list.
//!
//! Nothing here runs a process. The whole point is that the filter graph can be
//! asserted on a runner with no ffmpeg installed, because a graph that is one
//! character wrong fails at render time on the user's machine and nowhere else.

use crate::accel::Acceleration;
use crate::{AssetKind, Clip, Project, ProjectSettings, TrackKind};

/// What the Render menu offers. The number is the long edge, not the width, so
/// a vertical project renders 1080x1920 rather than a letterboxed landscape
/// frame with the video in a stripe down the middle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preset {
    Fhd,
    Uhd4k,
}

impl Preset {
    pub fn long_edge(self) -> u32 {
        match self {
            Preset::Fhd => 1920,
            Preset::Uhd4k => 3840,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Preset::Fhd => "FHD",
            Preset::Uhd4k => "4K",
        }
    }

    pub fn parse(name: &str) -> Result<Preset, String> {
        match name {
            "fhd" => Ok(Preset::Fhd),
            "4k" | "uhd" => Ok(Preset::Uhd4k),
            other => Err(format!("unknown render preset: {other}")),
        }
    }
}

/// h264 needs even dimensions, so every derived size passes through here.
fn even(value: f64) -> u32 {
    let rounded = value.round().max(2.0) as u32;
    rounded - (rounded % 2)
}

/// The preset sets the long edge and the project aspect decides the other one.
pub fn output_size(settings: &ProjectSettings, preset: Preset) -> (u32, u32) {
    let long = preset.long_edge() as f64;
    let width = settings.width.max(1) as f64;
    let height = settings.height.max(1) as f64;
    if width >= height {
        (even(long), even(long * height / width))
    } else {
        (even(long * width / height), even(long))
    }
}

fn secs(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

/// One ffmpeg input plus what the graph should take from it.
struct Item<'a> {
    clip: &'a Clip,
    path: &'a str,
    kind: AssetKind,
    video: bool,
    audio: bool,
}

/// Video tracks first and in track order, so the input index also happens to be
/// the paint order: track 1 is the bottom layer.
fn collect_items(project: &Project) -> Vec<Item<'_>> {
    let mut items = Vec::new();
    for kind in [TrackKind::Video, TrackKind::Audio] {
        for track in project.tracks.iter().filter(|track| track.kind == kind) {
            if !track.contributes() {
                continue;
            }
            let mut clips: Vec<&Clip> = track
                .clips
                .iter()
                .filter(|clip| clip.duration_ms() > 0)
                .collect();
            clips.sort_by_key(|clip| clip.start_ms);

            for clip in clips {
                let Some(asset) = project.asset(&clip.asset_id) else {
                    continue;
                };
                let has_sound = match asset.kind {
                    AssetKind::Audio => true,
                    AssetKind::Video => asset.has_audio,
                    AssetKind::Image => false,
                };
                // An audio asset on a video track draws nothing, and a silent
                // asset on an audio track carries nothing. Either way the clip
                // is dropped rather than turned into an input that would make
                // ffmpeg fail on a missing stream.
                let video = kind == TrackKind::Video
                    && matches!(asset.kind, AssetKind::Video | AssetKind::Image);
                let audio = has_sound && !(kind == TrackKind::Video && track.muted);
                if !video && !audio {
                    continue;
                }
                items.push(Item {
                    clip,
                    path: &asset.path,
                    kind: asset.kind,
                    video,
                    audio,
                });
            }
        }
    }
    items
}

/// What a hardware encoder should be asked for, in kbps.
///
/// x264 is given a quality target with `-crf`; a hardware encoder has no
/// equivalent that is available everywhere, so it gets a bitrate. The figure is
/// deliberately generous — around 0.12 bits per pixel per frame — because a
/// media engine spends more bits than x264 for the same picture. That is the
/// trade being made when this is switched on.
pub fn target_bitrate_kbps(width: u32, height: u32, fps: u32) -> u32 {
    let raw = f64::from(width) * f64::from(height) * f64::from(fps) * 0.12 / 1000.0;
    (raw.round() as u32).clamp(2_000, 80_000)
}

/// The full argv after the program name.
///
/// `accel` is the hardware path confirmed by `accel::candidates` plus a trial
/// encode, or None for the CPU. Only the encoder and the decode hint change:
/// the filter graph is identical either way, which is what makes falling back
/// to the CPU after a failed hardware render a re-run rather than a rebuild.
pub fn build_args(
    project: &Project,
    output: &str,
    preset: Preset,
    accel: Option<&Acceleration>,
) -> Result<Vec<String>, String> {
    let total_ms = project.duration_ms();
    if total_ms == 0 {
        return Err("the timeline is empty, there is nothing to render".into());
    }
    let items = collect_items(project);
    if items.is_empty() {
        return Err("every track is hidden or muted, there is nothing to render".into());
    }

    let (width, height) = output_size(&project.settings, preset);
    let fps = project.settings.fps.max(1);
    let total = secs(total_ms);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
    ];

    for item in &items {
        let duration = secs(item.clip.duration_ms());
        if item.kind == AssetKind::Image {
            // A still has no timeline of its own, so the input options are what
            // give it one. No -hwaccel: there is nothing to decode.
            args.extend(["-loop".into(), "1".into()]);
            args.extend(["-framerate".into(), fps.to_string()]);
            args.extend(["-t".into(), duration]);
        } else {
            // Decode on the GPU where it is offered. No -hwaccel_output_format,
            // so frames land back in system memory and the filter graph below
            // is untouched. A codec the hardware cannot handle falls back to
            // software on its own.
            if item.kind == AssetKind::Video {
                if let Some(name) = accel.and_then(|a| a.hwaccel.as_deref()) {
                    args.extend(["-hwaccel".into(), name.to_string()]);
                }
            }
            // -ss ahead of -i seeks before decoding, which is the difference
            // between a render that skips to the in point and one that decodes
            // everything before it and throws the frames away.
            args.extend(["-ss".into(), secs(item.clip.in_ms)]);
            args.extend(["-t".into(), duration]);
        }
        args.extend(["-i".into(), item.path.to_string()]);
    }

    let mut chains: Vec<String> = Vec::new();

    // The base is what fixes the output length and the frame rate; every clip
    // is composited onto it.
    chains.push(format!(
        "color=c=black:s={width}x{height}:r={fps}:d={total}[base]"
    ));

    let mut last_video = "base".to_string();
    let mut layer = 0;
    for (index, item) in items.iter().enumerate() {
        if !item.video {
            continue;
        }
        let start = secs(item.clip.start_ms);
        let end = secs(item.clip.end_ms());
        let opacity = if item.clip.opacity < 1.0 {
            format!(",colorchannelmixer=aa={:.3}", item.clip.opacity.max(0.0))
        } else {
            String::new()
        };
        // yuva420p and a transparent pad keep the letterbox bars of an
        // off-aspect clip from painting over the track underneath.
        //
        // tpad is what makes the overlay safe: both overlay inputs then run
        // from t=0, so framesync never waits on a stream that has not started.
        // enable= is belt and braces on top of that, and is also what hides the
        // clip again after its own end.
        chains.push(format!(
            "[{index}:v]format=yuva420p,\
             scale={width}:{height}:force_original_aspect_ratio=decrease,\
             pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,\
             fps={fps},setpts=PTS-STARTPTS{opacity},\
             tpad=start_duration={start}:start_mode=add:color=black@0[v{index}]"
        ));
        chains.push(format!(
            "[{last_video}][v{index}]overlay=x=0:y=0:eof_action=pass:enable='between(t,{start},{end})'[ov{layer}]"
        ));
        last_video = format!("ov{layer}");
        layer += 1;
    }
    chains.push(format!("[{last_video}]format=yuv420p[vout]"));

    let mut audio_labels: Vec<String> = Vec::new();
    for (index, item) in items.iter().enumerate() {
        if !item.audio {
            continue;
        }
        // adelay is the audio half of tpad: every stream starts at 0 so amix
        // has nothing to line up.
        chains.push(format!(
            "[{index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,\
             asetpts=PTS-STARTPTS,volume={:.3},adelay={}:all=1[a{index}]",
            item.clip.volume.max(0.0),
            item.clip.start_ms
        ));
        audio_labels.push(format!("[a{index}]"));
    }
    let has_audio = !audio_labels.is_empty();
    if has_audio {
        // normalize=0 keeps a single clip at its own level instead of dividing
        // it by the number of inputs.
        chains.push(format!(
            "{}amix=inputs={}:normalize=0:dropout_transition=0[aout]",
            audio_labels.concat(),
            audio_labels.len()
        ));
    }

    args.extend(["-filter_complex".into(), chains.join(";")]);
    args.extend(["-map".into(), "[vout]".into()]);
    if has_audio {
        args.extend(["-map".into(), "[aout]".into()]);
    }
    match accel {
        Some(hardware) => {
            // -preset and -crf are libx264 options. A hardware encoder ignores
            // them with a warning and then encodes at whatever its default
            // happens to be, so the bitrate has to be asked for explicitly or
            // the output quality is nobody's decision.
            args.extend([
                "-c:v".into(),
                hardware.encoder.clone(),
                "-b:v".into(),
                format!("{}k", target_bitrate_kbps(width, height, fps)),
            ]);
            if hardware.encoder.contains("videotoolbox") {
                // Lets VideoToolbox fall back to its own software encoder when
                // the media engine is busy, instead of failing the render.
                args.extend(["-allow_sw".into(), "1".into()]);
            }
            args.extend([
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-r".into(),
                fps.to_string(),
            ]);
        }
        None => {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "medium".into(),
                "-crf".into(),
                "20".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-r".into(),
                fps.to_string(),
            ]);
        }
    }
    if has_audio {
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
            "-ar".into(),
            "48000".into(),
        ]);
    }
    args.extend([
        // The base already ends at the right time; this bounds the audio too.
        "-t".into(),
        total,
        "-movflags".into(),
        "+faststart".into(),
        // The progress block is the only thing the app reads from stdout.
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ]);
    args.push(output.to_string());
    Ok(args)
}

/// A line of `-progress pipe:1` output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Progress {
    /// How far into the output ffmpeg has written, in milliseconds.
    Position(u64),
    Done,
}

/// `out_time_ms` is deliberately ignored: ffmpeg has reported microseconds in
/// that key for years, so reading it as milliseconds puts the progress bar at
/// 1000x and the render looks finished a second in.
pub fn parse_progress_line(line: &str) -> Option<Progress> {
    let (key, value) = line.trim().split_once('=')?;
    match key.trim() {
        "out_time_us" => value
            .trim()
            .parse::<u64>()
            .ok()
            .map(|us| Progress::Position(us / 1000)),
        "out_time" => parse_timecode(value.trim()).map(Progress::Position),
        "progress" if value.trim() == "end" => Some(Progress::Done),
        _ => None,
    }
}

/// `HH:MM:SS.ffffff` as written by ffmpeg.
fn parse_timecode(value: &str) -> Option<u64> {
    let mut parts = value.split(':');
    let hours: u64 = parts.next()?.parse().ok()?;
    let minutes: u64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some((hours * 3_600_000) + (minutes * 60_000) + (seconds * 1000.0).round() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Asset, Track};

    fn settings(width: u32, height: u32) -> ProjectSettings {
        ProjectSettings {
            width,
            height,
            fps: 30,
        }
    }

    fn asset(id: &str, kind: AssetKind, has_audio: bool) -> Asset {
        Asset {
            id: id.into(),
            path: format!("/media/{id}.mp4"),
            name: id.into(),
            kind,
            duration_ms: 10_000,
            width: 1920,
            height: 1080,
            has_audio,
        }
    }

    fn clip(id: &str, asset_id: &str, start_ms: u64, in_ms: u64, out_ms: u64) -> Clip {
        Clip {
            id: id.into(),
            asset_id: asset_id.into(),
            start_ms,
            in_ms,
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

    fn one_video_project() -> Project {
        Project {
            settings: settings(1920, 1080),
            assets: vec![asset("a1", AssetKind::Video, true)],
            tracks: vec![track(
                "V1",
                TrackKind::Video,
                vec![clip("c1", "a1", 2_000, 1_000, 4_000)],
            )],
        }
    }

    fn joined(args: &[String]) -> String {
        args.join(" ")
    }

    fn filter_of(args: &[String]) -> String {
        let index = args
            .iter()
            .position(|arg| arg == "-filter_complex")
            .unwrap();
        args[index + 1].clone()
    }

    #[test]
    fn empty_timeline_is_an_error() {
        let project = Project {
            settings: settings(1920, 1080),
            assets: vec![],
            tracks: vec![track("V1", TrackKind::Video, vec![])],
        };
        assert!(build_args(&project, "/out.mp4", Preset::Fhd, None).is_err());
    }

    #[test]
    fn a_clip_seeks_its_in_point_and_takes_its_own_length() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(
            text.contains("-ss 1.000 -t 3.000 -i /media/a1.mp4"),
            "{text}"
        );
        assert_eq!(args.last().unwrap(), "/out.mp4");
    }

    #[test]
    fn the_clip_lands_at_its_timeline_position() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(filter.contains("tpad=start_duration=2.000"), "{filter}");
        assert!(
            filter.contains("enable='between(t,2.000,5.000)'"),
            "{filter}"
        );
    }

    #[test]
    fn the_base_runs_for_the_whole_timeline() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        assert!(filter_of(&args).contains("color=c=black:s=1920x1080:r=30:d=5.000"));
        // The output is bounded too, so stray audio cannot run past the video.
        assert!(joined(&args).contains("-t 5.000 -movflags"));
    }

    #[test]
    fn a_silent_asset_produces_no_audio_output() {
        let mut project = one_video_project();
        project.assets[0].has_audio = false;
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        assert!(!joined(&args).contains("[aout]"));
        assert!(!joined(&args).contains("-c:a"));
    }

    #[test]
    fn audio_is_delayed_rather_than_trimmed_into_place() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(filter.contains("adelay=2000:all=1"), "{filter}");
        assert!(filter.contains("amix=inputs=1:normalize=0"), "{filter}");
        assert!(joined(&args).contains("-map [aout]"));
    }

    #[test]
    fn an_image_clip_loops_a_still_instead_of_seeking_it() {
        let mut project = one_video_project();
        project.assets[0].kind = AssetKind::Image;
        project.assets[0].has_audio = false;
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(text.contains("-loop 1 -framerate 30 -t 3.000 -i"), "{text}");
        assert!(!text.contains("-ss"), "{text}");
    }

    #[test]
    fn tracks_paint_in_order_with_track_one_underneath() {
        let project = Project {
            settings: settings(1920, 1080),
            assets: vec![
                asset("a1", AssetKind::Video, false),
                asset("a2", AssetKind::Video, false),
            ],
            tracks: vec![
                track("V1", TrackKind::Video, vec![clip("c1", "a1", 0, 0, 4_000)]),
                track("V2", TrackKind::Video, vec![clip("c2", "a2", 0, 0, 4_000)]),
            ],
        };
        let filter = filter_of(&build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap());
        assert!(filter.contains("[base][v0]overlay"), "{filter}");
        assert!(filter.contains("[ov0][v1]overlay"), "{filter}");
        assert!(filter.contains("[ov1]format=yuv420p[vout]"), "{filter}");
    }

    #[test]
    fn a_hidden_track_drops_out_of_the_render_entirely() {
        let mut project = one_video_project();
        project.tracks[0].hidden = true;
        assert!(build_args(&project, "/out.mp4", Preset::Fhd, None).is_err());
    }

    #[test]
    fn muting_a_video_track_keeps_its_picture() {
        let mut project = one_video_project();
        project.tracks[0].muted = true;
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        assert!(joined(&args).contains("-map [vout]"));
        assert!(!joined(&args).contains("[aout]"));
    }

    #[test]
    fn an_audio_track_contributes_sound_but_no_layer() {
        let project = Project {
            settings: settings(1920, 1080),
            assets: vec![asset("a1", AssetKind::Audio, true)],
            tracks: vec![track(
                "A1",
                TrackKind::Audio,
                vec![clip("c1", "a1", 500, 0, 3_000)],
            )],
        };
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(!filter.contains("overlay"), "{filter}");
        assert!(filter.contains("[base]format=yuv420p[vout]"), "{filter}");
        assert!(filter.contains("adelay=500:all=1"), "{filter}");
    }

    #[test]
    fn opacity_only_shows_up_when_it_is_not_full() {
        let mut project = one_video_project();
        assert!(
            !filter_of(&build_args(&project, "/o.mp4", Preset::Fhd, None).unwrap())
                .contains("colorchannelmixer")
        );
        project.tracks[0].clips[0].opacity = 0.5;
        assert!(
            filter_of(&build_args(&project, "/o.mp4", Preset::Fhd, None).unwrap())
                .contains("colorchannelmixer=aa=0.500")
        );
    }

    #[test]
    fn the_preset_sets_the_long_edge() {
        assert_eq!(
            output_size(&settings(1920, 1080), Preset::Fhd),
            (1920, 1080)
        );
        assert_eq!(
            output_size(&settings(1920, 1080), Preset::Uhd4k),
            (3840, 2160)
        );
        // A vertical project keeps its shape instead of being letterboxed.
        assert_eq!(
            output_size(&settings(1080, 1920), Preset::Fhd),
            (1080, 1920)
        );
        assert_eq!(
            output_size(&settings(1080, 1920), Preset::Uhd4k),
            (2160, 3840)
        );
        assert_eq!(
            output_size(&settings(1440, 1080), Preset::Fhd),
            (1920, 1440)
        );
    }

    #[test]
    fn every_derived_size_is_even_because_h264_demands_it() {
        // 1920x1079 would give an odd height if it were not rounded.
        let (width, height) = output_size(&settings(1920, 1079), Preset::Fhd);
        assert_eq!(width % 2, 0);
        assert_eq!(height % 2, 0);
    }

    fn videotoolbox() -> Acceleration {
        Acceleration {
            encoder: "h264_videotoolbox".into(),
            hwaccel: Some("videotoolbox".into()),
            label: "Apple VideoToolbox".into(),
        }
    }

    #[test]
    fn hardware_swaps_the_encoder_for_a_bitrate_target() {
        let hardware = videotoolbox();
        let args =
            build_args(&one_video_project(), "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        let text = joined(&args);
        assert!(text.contains("-c:v h264_videotoolbox"), "{text}");
        // -crf and -preset are libx264 options and would be silently ignored.
        assert!(!text.contains("-crf"), "{text}");
        assert!(!text.contains("-preset medium"), "{text}");
        assert!(text.contains("-b:v 7465k"), "{text}");
        assert!(text.contains("-allow_sw 1"), "{text}");
    }

    #[test]
    fn hardware_decode_is_asked_for_per_video_input() {
        let hardware = videotoolbox();
        let args =
            build_args(&one_video_project(), "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        assert!(joined(&args).contains("-hwaccel videotoolbox -ss 1.000"));
    }

    #[test]
    fn a_still_is_not_given_a_decoder_it_does_not_use() {
        let mut project = one_video_project();
        project.assets[0].kind = AssetKind::Image;
        project.assets[0].has_audio = false;
        let hardware = videotoolbox();
        let args = build_args(&project, "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        assert!(!joined(&args).contains("-hwaccel"), "{}", joined(&args));
    }

    #[test]
    fn an_encoder_without_a_decoder_still_encodes_on_the_gpu() {
        let hardware = Acceleration {
            encoder: "h264_nvenc".into(),
            hwaccel: None,
            label: "NVIDIA NVENC".into(),
        };
        let args =
            build_args(&one_video_project(), "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        let text = joined(&args);
        assert!(text.contains("-c:v h264_nvenc"), "{text}");
        assert!(!text.contains("-hwaccel"), "{text}");
        // allow_sw is a VideoToolbox option and means nothing to nvenc.
        assert!(!text.contains("-allow_sw"), "{text}");
    }

    #[test]
    fn the_graph_is_the_same_on_the_gpu_as_on_the_cpu() {
        // This is what lets a failed hardware render be retried on the CPU by
        // re-running rather than by rebuilding the project.
        let hardware = videotoolbox();
        let cpu = build_args(&one_video_project(), "/o.mp4", Preset::Fhd, None).unwrap();
        let gpu = build_args(&one_video_project(), "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        assert_eq!(filter_of(&cpu), filter_of(&gpu));
    }

    #[test]
    fn the_bitrate_follows_the_frame_and_stays_in_range() {
        assert_eq!(target_bitrate_kbps(1920, 1080, 30), 7465);
        assert_eq!(target_bitrate_kbps(3840, 2160, 30), 29860);
        // A tiny frame still gets something usable, a huge one stays sane.
        assert_eq!(target_bitrate_kbps(64, 64, 24), 2_000);
        assert_eq!(target_bitrate_kbps(7680, 4320, 60), 80_000);
    }

    #[test]
    fn progress_reads_microseconds_not_the_mislabelled_key() {
        assert_eq!(
            parse_progress_line("out_time_us=4100000"),
            Some(Progress::Position(4100))
        );
        // The key that lies about its unit is ignored on purpose.
        assert_eq!(parse_progress_line("out_time_ms=4100000"), None);
        assert_eq!(
            parse_progress_line("out_time=00:01:02.500000"),
            Some(Progress::Position(62_500))
        );
        assert_eq!(parse_progress_line("progress=end"), Some(Progress::Done));
        assert_eq!(parse_progress_line("progress=continue"), None);
        assert_eq!(parse_progress_line("frame=12"), None);
    }

    #[test]
    fn a_project_round_trips_through_json() {
        let project = one_video_project();
        let text = serde_json::to_string(&project).unwrap();
        let back: Project = serde_json::from_str(&text).unwrap();
        assert_eq!(back.duration_ms(), 5_000);
        // camelCase on the wire, because the page writes the same file.
        assert!(text.contains("\"startMs\""), "{text}");
        assert!(text.contains("\"assetId\""), "{text}");
    }

    #[test]
    fn a_clip_written_before_volume_existed_still_opens() {
        let text = r#"{
            "settings": {"width": 1920, "height": 1080, "fps": 30},
            "assets": [{"id": "a1", "path": "/m.mp4", "kind": "video", "hasAudio": true}],
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "startMs": 0, "inMs": 0, "outMs": 1000}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.tracks[0].clips[0].volume, 1.0);
        assert_eq!(project.tracks[0].clips[0].opacity, 1.0);
    }
}
