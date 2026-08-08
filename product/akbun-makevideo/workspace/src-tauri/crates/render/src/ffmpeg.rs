//! Turning a project into an ffmpeg argument list.
//!
//! Nothing here runs a process. The whole point is that the filter graph can be
//! asserted on a runner with no ffmpeg installed, because a graph that is one
//! character wrong fails at render time on the user's machine and nowhere else.
//!
//! Times arrive as frame counts and leave as seconds, and that conversion is
//! the only place rounding is allowed to happen. Frame rates leave as the ratio
//! they are — `30000/1001`, which ffmpeg takes everywhere a rate is wanted —
//! because a decimal here would quietly reintroduce the drift.

use crate::accel::Acceleration;
use crate::layout;
use crate::{AssetKind, Clip, Project, ProjectSettings, Rate, RationalTime, TrackKind};

/// Everything is resampled to this on the way in, so a sample count means the
/// same thing in every chain.
///
/// Public because the playback engine mixes at it too. Sharing the constant
/// rather than writing 48000 twice is what makes "the mix you hear is the mix
/// that renders" a statement the compiler helps keep true.
pub const AUDIO_HZ: u32 = 48_000;

/// Enough places that the error is under a microsecond, which is four orders of
/// magnitude below a frame at any rate anybody shoots.
const SECOND_DECIMALS: u32 = 6;

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

fn secs(time: RationalTime) -> String {
    time.seconds_text(SECOND_DECIMALS)
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
                .filter(|clip| clip.duration_frames() > 0)
                .collect();
            clips.sort_by_key(|clip| clip.start);

            for clip in clips {
                let Some(asset) = project.asset(&clip.asset_id) else {
                    continue;
                };
                // An audio asset on a video track draws nothing, and a silent
                // asset on an audio track carries nothing. Either way the clip
                // is dropped rather than turned into an input that would make
                // ffmpeg fail on a missing stream.
                let video = kind == TrackKind::Video
                    && matches!(asset.kind, AssetKind::Video | AssetKind::Image);
                // The audible rule is `layout::carries_sound` rather than a copy
                // of it, because the playback mixer asks the same question and
                // two answers to it would be a clip that plays and does not
                // render, or the other way round.
                let audio = layout::carries_sound(asset, track);
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
pub fn target_bitrate_kbps(width: u32, height: u32, rate: Rate) -> u32 {
    let raw = f64::from(width) * f64::from(height) * rate.as_f64() * 0.12 / 1000.0;
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
    let rate = project.rate();
    let duration = project.duration();
    if duration.value() == 0 {
        return Err("the timeline is empty, there is nothing to render".into());
    }
    let items = collect_items(project);
    if items.is_empty() {
        return Err("every track is hidden or muted, there is nothing to render".into());
    }

    let (width, height) = output_size(&project.settings, preset);
    let fps = rate.ratio_text();
    let total = secs(duration);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
    ];

    for item in &items {
        let length = secs(item.clip.duration(rate));
        if item.kind == AssetKind::Image {
            // A still has no timeline of its own, so the input options are what
            // give it one. No -hwaccel: there is nothing to decode.
            args.extend(["-loop".into(), "1".into()]);
            args.extend(["-framerate".into(), fps.clone()]);
            args.extend(["-t".into(), length]);
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
            args.extend(["-ss".into(), secs(item.clip.in_time(rate))]);
            args.extend(["-t".into(), length]);
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
        let start = secs(item.clip.start_time(rate));
        let end = secs(item.clip.end_time(rate));
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
        chains.push(audio_chain(item, index, rate));
        audio_labels.push(format!("[a{index}]"));
    }
    let has_audio = !audio_labels.is_empty();
    if has_audio {
        chains.push(mix_chain(&audio_labels));
    }

    args.extend(["-filter_complex".into(), chains.join(";")]);
    args.extend(["-map".into(), "[vout]".into()]);
    if has_audio {
        args.extend(["-map".into(), "[aout]".into()]);
    }
    args.extend(video_codec_args(accel, width, height, rate));
    if has_audio {
        args.extend(audio_codec_args());
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

/// One audio clip's chain. `input` is its position in the argument list, which
/// differs between the two paths: the filter graph feeds every clip in as its
/// own input, while the composited path puts the frame pipe at 0 and shifts
/// audio up by one.
fn audio_chain(item: &Item, input: usize, rate: Rate) -> String {
    // adelay is the audio half of tpad: every stream starts at 0 so amix has
    // nothing to line up. The delay is given in samples rather than in the
    // milliseconds adelay takes by default, because a frame of 29.97 is not a
    // whole number of milliseconds and half a millisecond of slip per clip is
    // exactly the kind of thing nobody can hear and everybody can measure.
    // Six places on the gain, not three. A clip's volume is an f32 and the
    // playback mixer multiplies by all of it, so three places make the file
    // quieter or louder than what was heard by up to 5e-4 — and round a clip
    // set below 0.0005 to silence. Six is past what an f32 in 0..1 can tell
    // apart, so the two mixes agree exactly.
    format!(
        "[{input}:a]aformat=sample_fmts=fltp:sample_rates={AUDIO_HZ}:channel_layouts=stereo,\
         asetpts=PTS-STARTPTS,volume={:.6},adelay={}S:all=1[a{input}]",
        item.clip.volume.max(0.0),
        item.clip.start_time(rate).to_samples(AUDIO_HZ)
    )
}

/// normalize=0 keeps a single clip at its own level instead of dividing it by
/// the number of inputs.
fn mix_chain(labels: &[String]) -> String {
    format!(
        "{}amix=inputs={}:normalize=0:dropout_transition=0[aout]",
        labels.concat(),
        labels.len()
    )
}

fn video_codec_args(
    accel: Option<&Acceleration>,
    width: u32,
    height: u32,
    rate: Rate,
) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
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
                format!("{}k", target_bitrate_kbps(width, height, rate)),
            ]);
            if hardware.encoder.contains("videotoolbox") {
                // Lets VideoToolbox fall back to its own software encoder when
                // the media engine is busy, instead of failing the render.
                args.extend(["-allow_sw".into(), "1".into()]);
            }
        }
        None => {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "medium".into(),
                "-crf".into(),
                "20".into(),
            ]);
        }
    }
    args.extend(["-pix_fmt".into(), "yuv420p".into(), "-r".into(), rate.ratio_text()]);
    args
}

fn audio_codec_args() -> Vec<String> {
    vec![
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        "-ar".into(),
        AUDIO_HZ.to_string(),
    ]
}

// --- the composited path ---------------------------------------------------
//
// The graph above does everything in ffmpeg. These two build the other route:
// one decoder per clip handing raw frames to the wgpu compositor, and one
// encoder taking the composited frames back on stdin. Audio never leaves
// ffmpeg either way, because amix is not something worth reimplementing.

/// What one decoder is being asked for.
pub struct Decode<'a> {
    pub path: &'a str,
    pub kind: AssetKind,
    /// Where to seek to, and how much to read, as times rather than as frame
    /// indexes: ffmpeg takes seconds.
    pub in_time: RationalTime,
    pub duration: RationalTime,
    /// From `layout::fit_rect`, so the size is a decision made in one place.
    pub width: u32,
    pub height: u32,
    pub rate: Rate,
    pub hwaccel: Option<&'a str>,
}

/// Decode one clip to raw RGBA at the project frame rate, already scaled to
/// the size it will be drawn at.
///
/// The scaling is here rather than in the compositor because ffmpeg is already
/// decoding the frame and its scaler is better than a bilinear texture fetch.
/// The *size* is still decided by `layout::fit_rect`, so this is ffmpeg
/// carrying out a decision made in one place, not making one of its own.
pub fn decoder_args(request: &Decode<'_>) -> Vec<String> {
    let Decode {
        path,
        kind,
        in_time,
        duration,
        width,
        height,
        rate,
        hwaccel,
    } = *request;
    let fps = rate.ratio_text();
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
    ];
    if kind == AssetKind::Image {
        args.extend(["-loop".into(), "1".into()]);
        args.extend(["-framerate".into(), fps.clone()]);
        args.extend(["-t".into(), secs(duration)]);
    } else {
        if let Some(name) = hwaccel {
            args.extend(["-hwaccel".into(), name.to_string()]);
        }
        args.extend(["-ss".into(), secs(in_time)]);
        args.extend(["-t".into(), secs(duration)]);
    }
    args.extend(["-i".into(), path.to_string()]);
    // fps= is what makes the frame count predictable: the reader takes exactly
    // one frame per output frame and a variable frame rate source would
    // otherwise drift out of step with the timeline.
    args.extend([
        "-vf".into(),
        format!("scale={width}:{height},fps={fps}"),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "rgba".into(),
        "-".into(),
    ]);
    args
}

/// What one clip's sound is being asked for.
pub struct DecodeAudio<'a> {
    pub path: &'a str,
    /// Where to seek to and how much to read, as times rather than as sample
    /// counts: ffmpeg's `-ss` and `-t` take seconds.
    pub in_time: RationalTime,
    pub duration: RationalTime,
}

/// Decode one clip's sound to raw interleaved f32 at `AUDIO_HZ`, in stereo.
///
/// The `aformat` here asks for the same **rate and channel layout** the export
/// chain opens with, so a source at 44.1 kHz goes through the same resampler on
/// the way to playback that it goes through on the way to the file. That is the
/// whole reason the resampling is asked of ffmpeg rather than written again in
/// Rust: two resamplers that disagree by a fraction of a sample per second are
/// a project whose sound slides away from its picture over ten minutes.
///
/// The sample format is the one thing that differs, and it changes nothing:
/// `flt` here against `fltp` in the export chain is packed against planar, the
/// same numbers in a different order. Packed is what `-f f32le` writes, and
/// planar is what the rest of the export graph wants.
///
/// `volume` is deliberately not applied. It is one multiply, the mixer does it,
/// and leaving it out is what lets the mixer be tested on samples that are
/// still the ones the file holds.
pub fn audio_decoder_args(request: &DecodeAudio<'_>) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        secs(request.in_time),
        "-t".into(),
        secs(request.duration),
        "-i".into(),
        request.path.to_string(),
        // A video file on an audio track is opened for its sound only. Decoding
        // the picture to throw it away would cost more than the mixing does.
        "-vn".into(),
        "-af".into(),
        format!("aformat=sample_fmts=flt:sample_rates={AUDIO_HZ}:channel_layouts=stereo"),
        "-f".into(),
        "f32le".into(),
        "-ac".into(),
        "2".into(),
        "-ar".into(),
        AUDIO_HZ.to_string(),
        "-".into(),
    ]
}

/// The export mix on its own, written as raw f32 rather than encoded.
///
/// Built from the same `audio_chain` and `amix` that `build_args` uses, and it
/// exists so the playback mixer has something exact to be checked against.
/// Going through the real output would put an aac encoder between the two
/// answers, and then a difference would say nothing about the mixing.
///
/// `Ok(None)` means the project has no sound at all, which is not an error.
pub fn mix_reference_args(project: &Project, output: &str) -> Option<Vec<String>> {
    let rate = project.rate();
    let items = collect_items(project);
    let audio: Vec<&Item> = items.iter().filter(|item| item.audio).collect();
    if audio.is_empty() {
        return None;
    }

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
    ];
    for item in &audio {
        args.extend(["-ss".into(), secs(item.clip.in_time(rate))]);
        args.extend(["-t".into(), secs(item.clip.duration(rate))]);
        args.extend(["-i".into(), item.path.to_string()]);
    }

    let mut chains = Vec::new();
    let mut labels = Vec::new();
    for (index, item) in audio.iter().enumerate() {
        chains.push(audio_chain(item, index, rate));
        labels.push(format!("[a{index}]"));
    }
    chains.push(mix_chain(&labels));

    args.extend(["-filter_complex".into(), chains.join(";")]);
    args.extend(["-map".into(), "[aout]".into()]);
    args.extend([
        "-t".into(),
        secs(project.duration()),
        "-f".into(),
        "f32le".into(),
        "-ac".into(),
        "2".into(),
        "-ar".into(),
        AUDIO_HZ.to_string(),
    ]);
    args.push(output.to_string());
    Some(args)
}

/// Encode composited RGBA frames arriving on stdin. Audio is still read from
/// the source files and mixed by ffmpeg, so only the picture takes the long
/// way round.
pub fn encoder_args(
    project: &Project,
    output: &str,
    preset: Preset,
    accel: Option<&Acceleration>,
) -> Result<Vec<String>, String> {
    let rate = project.rate();
    let duration = project.duration();
    if duration.value() == 0 {
        return Err("the timeline is empty, there is nothing to render".into());
    }
    let (width, height) = output_size(&project.settings, preset);
    let total = secs(duration);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        // Input 0 is the compositor. Every audio input below is shifted by one
        // because of it.
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "rgba".into(),
        "-s".into(),
        format!("{width}x{height}"),
        "-r".into(),
        rate.ratio_text(),
        "-i".into(),
        "pipe:0".into(),
    ];

    let items = collect_items(project);
    let audio: Vec<&Item> = items.iter().filter(|item| item.audio).collect();
    for item in &audio {
        args.extend(["-ss".into(), secs(item.clip.in_time(rate))]);
        args.extend(["-t".into(), secs(item.clip.duration(rate))]);
        args.extend(["-i".into(), item.path.to_string()]);
    }

    let has_audio = !audio.is_empty();
    if has_audio {
        let mut chains = Vec::new();
        let mut labels = Vec::new();
        for (index, item) in audio.iter().enumerate() {
            let input = index + 1;
            chains.push(audio_chain(item, input, rate));
            labels.push(format!("[a{input}]"));
        }
        chains.push(format!(
            "{}amix=inputs={}:normalize=0:dropout_transition=0[aout]",
            labels.concat(),
            labels.len()
        ));
        args.extend(["-filter_complex".into(), chains.join(";")]);
    }

    args.extend(["-map".into(), "0:v".into()]);
    if has_audio {
        args.extend(["-map".into(), "[aout]".into()]);
    }
    args.extend(video_codec_args(accel, width, height, rate));
    if has_audio {
        args.extend(audio_codec_args());
    }
    args.extend([
        "-t".into(),
        total,
        "-movflags".into(),
        "+faststart".into(),
        // No -progress here: the frame loop counts frames, so it knows exactly
        // where the render is and does not need ffmpeg to guess. Asking for it
        // anyway would mean draining a pipe nobody reads, and a full pipe stops
        // ffmpeg dead.
        "-nostats".into(),
    ]);
    args.push(output.to_string());
    Ok(args)
}

/// A line of `-progress pipe:1` output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Progress {
    /// How far into the output ffmpeg has written, in milliseconds. This one is
    /// a progress bar rather than a decision about a frame, so milliseconds are
    /// all it needs and all ffmpeg reports.
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
            rate: Rate::fps(30),
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

    fn clip(id: &str, asset_id: &str, start: i64, in_point: i64, out_point: i64) -> Clip {
        Clip {
            id: id.into(),
            asset_id: asset_id.into(),
            link_group: None,
            start,
            in_point,
            out_point,
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
            visual_items: Vec::new(),
            muted: false,
            hidden: false,
        }
    }

    /// One clip, two seconds in, three seconds long, on a five second timeline.
    /// At 30 fps that is frames 60 to 150, taken from frame 30 of the source.
    fn one_video_project() -> Project {
        Project {
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![asset("a1", AssetKind::Video, true)],
            tracks: vec![track(
                "V1",
                TrackKind::Video,
                vec![clip("c1", "a1", 60, 30, 120)],
            )],
            markers: Vec::new(),
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
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![],
            tracks: vec![track("V1", TrackKind::Video, vec![])],
            markers: Vec::new(),
        };
        assert!(build_args(&project, "/out.mp4", Preset::Fhd, None).is_err());
    }

    #[test]
    fn a_clip_seeks_its_in_point_and_takes_its_own_length() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(
            text.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
            "{text}"
        );
        assert_eq!(args.last().unwrap(), "/out.mp4");
    }

    #[test]
    fn the_clip_lands_at_its_timeline_position() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(filter.contains("tpad=start_duration=2.000000"), "{filter}");
        assert!(
            filter.contains("enable='between(t,2.000000,5.000000)'"),
            "{filter}"
        );
    }

    #[test]
    fn the_base_runs_for_the_whole_timeline() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        assert!(filter_of(&args).contains("color=c=black:s=1920x1080:r=30:d=5.000000"));
        // The output is bounded too, so stray audio cannot run past the video.
        assert!(joined(&args).contains("-t 5.000000 -movflags"));
    }

    #[test]
    fn a_broadcast_rate_reaches_ffmpeg_as_the_ratio_it_is() {
        // The reason the whole model changed. A decimal here would be 29.97,
        // ffmpeg would round it to something of its own, and every clip would
        // land on a slightly different frame than the timeline says.
        let mut project = one_video_project();
        project.settings.rate = Rate::ntsc(30);
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(
            filter.contains("color=c=black:s=1920x1080:r=30000/1001"),
            "{filter}"
        );
        assert!(filter.contains("fps=30000/1001"), "{filter}");
        assert!(joined(&args).contains("-r 30000/1001"), "{}", joined(&args));
        // 150 frames of 29.97 is 5.005 seconds, not 5.
        assert!(joined(&args).contains("-t 5.005000 -movflags"), "{}", joined(&args));
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
    fn audio_is_delayed_by_a_sample_count_rather_than_a_millisecond_count() {
        let args = build_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        // Two seconds at 48 kHz.
        assert!(filter.contains("adelay=96000S:all=1"), "{filter}");
        assert!(filter.contains("amix=inputs=1:normalize=0"), "{filter}");
        assert!(joined(&args).contains("-map [aout]"));
    }

    #[test]
    fn a_broadcast_rate_delays_audio_to_the_sample_the_picture_starts_on() {
        let mut project = one_video_project();
        project.settings.rate = Rate::ntsc(30);
        let filter = filter_of(&build_args(&project, "/o.mp4", Preset::Fhd, None).unwrap());
        // Frame 60 of 29.97 is 2.002 seconds, which is 96096 samples. In
        // milliseconds this was 2002 either way; the difference shows on the
        // frames whose time is not a whole number of them.
        assert!(filter.contains("adelay=96096S:all=1"), "{filter}");
    }

    #[test]
    fn an_image_clip_loops_a_still_instead_of_seeking_it() {
        let mut project = one_video_project();
        project.assets[0].kind = AssetKind::Image;
        project.assets[0].has_audio = false;
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(
            text.contains("-loop 1 -framerate 30 -t 3.000000 -i"),
            "{text}"
        );
        assert!(!text.contains("-ss"), "{text}");
    }

    #[test]
    fn tracks_paint_in_order_with_track_one_underneath() {
        let project = Project {
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![
                asset("a1", AssetKind::Video, false),
                asset("a2", AssetKind::Video, false),
            ],
            tracks: vec![
                track("V1", TrackKind::Video, vec![clip("c1", "a1", 0, 0, 120)]),
                track("V2", TrackKind::Video, vec![clip("c2", "a2", 0, 0, 120)]),
            ],
            markers: Vec::new(),
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
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![asset("a1", AssetKind::Audio, true)],
            tracks: vec![track(
                "A1",
                TrackKind::Audio,
                vec![clip("c1", "a1", 15, 0, 90)],
            )],
            markers: Vec::new(),
        };
        let args = build_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let filter = filter_of(&args);
        assert!(!filter.contains("overlay"), "{filter}");
        assert!(filter.contains("[base]format=yuv420p[vout]"), "{filter}");
        // Half a second in, which is 24000 samples.
        assert!(filter.contains("adelay=24000S:all=1"), "{filter}");
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
        assert!(joined(&args).contains("-hwaccel videotoolbox -ss 1.000000"));
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
        assert_eq!(target_bitrate_kbps(1920, 1080, Rate::fps(30)), 7465);
        assert_eq!(target_bitrate_kbps(3840, 2160, Rate::fps(30)), 29860);
        // 29.97 asks for slightly less than 30 does, which it should.
        assert_eq!(target_bitrate_kbps(1920, 1080, Rate::ntsc(30)), 7458);
        // A tiny frame still gets something usable, a huge one stays sane.
        assert_eq!(target_bitrate_kbps(64, 64, Rate::fps(24)), 2_000);
        assert_eq!(target_bitrate_kbps(7680, 4320, Rate::fps(60)), 80_000);
    }

    #[test]
    fn a_decoder_hands_over_raw_frames_at_the_project_rate() {
        let rate = Rate::fps(30);
        let args = decoder_args(&Decode {
            path: "/media/a1.mp4",
            kind: AssetKind::Video,
            in_time: RationalTime::new(30, rate),
            duration: RationalTime::new(90, rate),
            width: 1440,
            height: 1080,
            rate,
            hwaccel: None,
        })
        .join(" ");
        assert!(
            args.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
            "{args}"
        );
        // The size comes from layout::fit_rect, and fps= is what keeps the
        // frame count in step with the timeline.
        assert!(args.contains("-vf scale=1440:1080,fps=30"), "{args}");
        assert!(args.ends_with("-f rawvideo -pix_fmt rgba -"), "{args}");
    }

    #[test]
    fn a_decoder_on_a_broadcast_rate_asks_for_the_ratio() {
        let rate = Rate::ntsc(24);
        let args = decoder_args(&Decode {
            path: "/m/a.mp4",
            kind: AssetKind::Video,
            in_time: RationalTime::new(24, rate),
            duration: RationalTime::new(24, rate),
            width: 640,
            height: 480,
            rate,
            hwaccel: None,
        })
        .join(" ");
        assert!(args.contains("-ss 1.001000 -t 1.001000"), "{args}");
        assert!(args.contains("fps=24000/1001"), "{args}");
    }

    #[test]
    fn a_still_decoder_loops_instead_of_seeking() {
        let rate = Rate::fps(25);
        let args = decoder_args(&Decode {
            path: "/m/a.png",
            kind: AssetKind::Image,
            in_time: RationalTime::zero(rate),
            duration: RationalTime::new(50, rate),
            width: 800,
            height: 600,
            rate,
            hwaccel: None,
        })
        .join(" ");
        assert!(args.contains("-loop 1 -framerate 25 -t 2.000000"), "{args}");
        assert!(!args.contains("-ss"), "{args}");
        assert!(!args.contains("-hwaccel"), "a still has nothing to decode");
    }

    #[test]
    fn a_decoder_uses_the_hardware_when_there_is_some() {
        let rate = Rate::fps(30);
        let args = decoder_args(&Decode {
            path: "/m/a.mp4",
            kind: AssetKind::Video,
            in_time: RationalTime::zero(rate),
            duration: RationalTime::new(30, rate),
            width: 640,
            height: 480,
            rate,
            hwaccel: Some("videotoolbox"),
        })
        .join(" ");
        assert!(args.contains("-hwaccel videotoolbox -ss"), "{args}");
    }

    #[test]
    fn the_encoder_takes_the_picture_from_the_pipe_and_the_sound_from_the_files() {
        let args = encoder_args(&one_video_project(), "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(
            text.contains("-f rawvideo -pix_fmt rgba -s 1920x1080 -r 30 -i pipe:0"),
            "{text}"
        );
        assert!(text.contains("-map 0:v"), "{text}");
        assert!(text.contains("-map [aout]"), "{text}");
        // The audio file is a real input after the pipe, so its index is 1.
        assert!(text.contains("-i /media/a1.mp4"), "{text}");
        assert!(filter_of(&args).contains("[1:a]"), "{}", filter_of(&args));
        assert!(filter_of(&args).contains("adelay=96000S:all=1"));
        // No video filtering at all: the compositor already drew the frame.
        assert!(
            !filter_of(&args).contains("overlay"),
            "{}",
            filter_of(&args)
        );
        assert!(!filter_of(&args).contains("[vout]"));
    }

    #[test]
    fn a_silent_project_encodes_video_only_from_the_pipe() {
        let mut project = one_video_project();
        project.assets[0].has_audio = false;
        let args = encoder_args(&project, "/out.mp4", Preset::Fhd, None).unwrap();
        let text = joined(&args);
        assert!(text.contains("-map 0:v"), "{text}");
        assert!(!text.contains("[aout]"), "{text}");
        assert!(!text.contains("-filter_complex"), "{text}");
        assert!(!text.contains("-c:a"), "{text}");
    }

    #[test]
    fn both_paths_encode_with_the_same_settings() {
        // The route the picture takes must not change what it is encoded as.
        let project = one_video_project();
        let graph = joined(&build_args(&project, "/o.mp4", Preset::Fhd, None).unwrap());
        let piped = joined(&encoder_args(&project, "/o.mp4", Preset::Fhd, None).unwrap());
        for setting in [
            "-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30",
            "-c:a aac -b:a 192k -ar 48000",
            "-t 5.000000 -movflags +faststart",
        ] {
            assert!(graph.contains(setting), "filter graph missing {setting}");
            assert!(piped.contains(setting), "piped encoder missing {setting}");
        }
    }

    #[test]
    fn the_piped_encoder_uses_the_hardware_encoder_too() {
        let hardware = videotoolbox();
        let args =
            encoder_args(&one_video_project(), "/o.mp4", Preset::Fhd, Some(&hardware)).unwrap();
        let text = joined(&args);
        assert!(text.contains("-c:v h264_videotoolbox -b:v 7465k"), "{text}");
        // The decode hint belongs on the decoders, not on a pipe of raw frames.
        assert!(!text.contains("-hwaccel"), "{text}");
    }

    #[test]
    fn an_empty_timeline_has_nothing_to_encode_either() {
        let project = Project {
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![],
            tracks: vec![],
            markers: Vec::new(),
        };
        assert!(encoder_args(&project, "/o.mp4", Preset::Fhd, None).is_err());
    }

    #[test]
    fn an_audio_decoder_resamples_with_the_same_filter_the_export_opens_with() {
        // The claim the playback mixer stands on. A source at 44.1 kHz reaches
        // the mixer through this filter and reaches the file through
        // `audio_chain`, and both say sample_rates=48000, so the two answers
        // come out of one resampler rather than two.
        let rate = Rate::fps(30);
        let args = audio_decoder_args(&DecodeAudio {
            path: "/media/a1.mp4",
            in_time: RationalTime::new(30, rate),
            duration: RationalTime::new(90, rate),
        })
        .join(" ");
        assert!(
            args.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
            "{args}"
        );
        assert!(args.contains("sample_rates=48000"), "{args}");
        assert!(args.contains("channel_layouts=stereo"), "{args}");
        assert!(args.contains("-vn"), "a video input is opened for its sound");
        assert!(args.ends_with("-f f32le -ac 2 -ar 48000 -"), "{args}");
        // Volume belongs to the mixer, so what arrives is still what the file
        // holds.
        assert!(!args.contains("volume="), "{args}");
    }

    #[test]
    fn the_reference_mix_is_the_export_mix_written_as_raw_samples() {
        let args = mix_reference_args(&one_video_project(), "/tmp/mix.f32").unwrap();
        let text = joined(&args);
        let filter = filter_of(&args);
        // Character for character what build_args puts in the file, which is
        // what makes a difference in the samples a difference in the mixing.
        let exported = filter_of(&build_args(&one_video_project(), "/o.mp4", Preset::Fhd, None).unwrap());
        assert!(exported.contains("adelay=96000S:all=1"), "{exported}");
        assert!(filter.contains("adelay=96000S:all=1"), "{filter}");
        assert!(filter.contains("amix=inputs=1:normalize=0"), "{filter}");
        assert!(text.contains("-map [aout]"), "{text}");
        assert!(text.contains("-f f32le -ac 2 -ar 48000"), "{text}");
        assert!(text.contains("-t 5.000000"), "the timeline bounds it: {text}");
        assert!(!text.contains("-c:a"), "nothing is encoded: {text}");
        assert_eq!(args.last().unwrap(), "/tmp/mix.f32");
    }

    #[test]
    fn the_reference_mix_numbers_its_inputs_from_zero() {
        // encoder_args shifts audio up by one because the frame pipe is input
        // 0. There is no pipe here, so an off by one would line every clip up
        // against the wrong file.
        let project = Project {
            version: crate::FORMAT_VERSION,
            settings: settings(1920, 1080),
            assets: vec![asset("a1", AssetKind::Video, true), asset("a2", AssetKind::Audio, true)],
            tracks: vec![
                track("V1", TrackKind::Video, vec![clip("c1", "a1", 0, 0, 60)]),
                track("A1", TrackKind::Audio, vec![clip("c2", "a2", 30, 0, 60)]),
            ],
            markers: Vec::new(),
        };
        let filter = filter_of(&mix_reference_args(&project, "/tmp/mix.f32").unwrap());
        assert!(filter.contains("[0:a]"), "{filter}");
        assert!(filter.contains("[1:a]"), "{filter}");
        assert!(filter.contains("[a0][a1]amix=inputs=2"), "{filter}");
    }

    #[test]
    fn a_project_with_nothing_audible_has_no_reference_mix() {
        let mut project = one_video_project();
        project.assets[0].has_audio = false;
        assert!(mix_reference_args(&project, "/tmp/mix.f32").is_none());
    }

    #[test]
    fn the_export_takes_the_same_clips_the_playback_mixer_will() {
        // Both sides ask layout::carries_sound, and this is the check that the
        // render really routes through it rather than keeping a copy.
        let mut project = one_video_project();
        project.tracks.push(track(
            "A1",
            TrackKind::Audio,
            vec![clip("c2", "a2", 0, 0, 60)],
        ));
        project.assets.push(asset("a2", AssetKind::Audio, true));
        project.tracks[0].muted = true;

        let audible: Vec<&str> = collect_items(&project)
            .iter()
            .filter(|item| item.audio)
            .map(|item| item.clip.id.as_str())
            .collect();
        let mixed: Vec<String> = crate::layout::audio_placements(&project)
            .into_iter()
            .map(|placement| placement.clip_id)
            .collect();
        assert_eq!(audible, vec!["c2"], "the muted video track is out");
        assert_eq!(mixed, audible);
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
        assert_eq!(back.duration_frames(), 150);
        // camelCase on the wire, because the page writes the same file.
        assert!(text.contains("\"assetId\""), "{text}");
        assert!(text.contains("\"start\":60"), "{text}");
    }

    #[test]
    fn a_clip_written_before_volume_existed_still_opens() {
        let text = r#"{
            "version": 2,
            "settings": {"width": 1920, "height": 1080, "rate": {"num": 30, "den": 1}},
            "assets": [{"id": "a1", "path": "/m.mp4", "kind": "video", "hasAudio": true}],
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "start": 0, "in": 0, "out": 30}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.tracks[0].clips[0].volume, 1.0);
        assert_eq!(project.tracks[0].clips[0].opacity, 1.0);
    }
}
