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
use crate::{AssetKind, Clip, Crop, Project, ProjectSettings, Rate, RationalTime, TrackKind};

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

pub use crate::preset::{Preset, Quality};

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
                let audio = layout::clip_carries_sound(project, asset, track, clip);
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
pub fn target_bitrate_kbps(width: u32, height: u32, rate: Rate, quality: Quality) -> u32 {
    let raw =
        f64::from(width) * f64::from(height) * rate.as_f64() * quality.bits_per_pixel() / 1000.0;
    (raw.round() as u32).clamp(2_000, 80_000)
}

/// A rasterized text or shape layer as an extra graph input: a still image
/// file, where it sits on the output frame, and the frames it covers.
///
/// The compositor rasterizes these — the same pixels the composited route
/// composites — so the graph render burns the same picture in rather than
/// approximating it with drawtext. The graph only overlays.
#[derive(Debug, Clone)]
pub struct VisualInput {
    pub path: String,
    pub x: i32,
    pub y: i32,
    pub opacity: f32,
    pub start_frame: i64,
    pub end_frame: i64,
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
    visuals: &[VisualInput],
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
        let length = secs(RationalTime::new(item.clip.source_duration_frames(), rate));
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

    // The visual stills come after every clip input, so a clip's input index
    // is unchanged whether or not the project has any text on it.
    for visual in visuals {
        args.extend(["-loop".into(), "1".into()]);
        args.extend(["-framerate".into(), fps.clone()]);
        // Frames until the item's own end: overlay stops drawing a secondary
        // input that has ended, and enable= only hides, it does not feed.
        args.extend([
            "-t".into(),
            secs(layout::frame_time(visual.end_frame, rate)),
        ]);
        args.extend(["-i".into(), visual.path.clone()]);
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
             setpts=(PTS-STARTPTS)/{:.6},fps={fps}{opacity},\
             tpad=start_duration={start}:start_mode=add:color=black@0[v{index}]",
            item.clip.speed
        ));
        chains.push(format!(
            "[{last_video}][v{index}]overlay=x=0:y=0:eof_action=pass:enable='between(t,{start},{end})'[ov{layer}]"
        ));
        last_video = format!("ov{layer}");
        layer += 1;
    }

    // Text and shape layers go over every clip, which is where the composited
    // route puts them too. Each still is already at output resolution and at
    // its own size, so the chain is placement and timing, no scaling.
    for (offset, visual) in visuals.iter().enumerate() {
        let input = items.len() + offset;
        let start = secs(layout::frame_time(visual.start_frame, rate));
        let end = secs(layout::frame_time(visual.end_frame, rate));
        let opacity = if visual.opacity < 1.0 {
            format!(",colorchannelmixer=aa={:.3}", visual.opacity.max(0.0))
        } else {
            String::new()
        };
        chains.push(format!(
            "[{input}:v]format=yuva420p,fps={fps},setpts=PTS-STARTPTS{opacity}[g{offset}]"
        ));
        chains.push(format!(
            "[{last_video}][g{offset}]overlay=x={}:y={}:eof_action=pass:enable='between(t,{start},{end})'[ovg{offset}]",
            visual.x, visual.y
        ));
        last_video = format!("ovg{offset}");
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
    args.extend(video_codec_args(accel, width, height, rate, preset.quality));
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
    let speed = speed_audio_filter(item.clip.speed, item.clip.preserve_pitch);
    let volume = volume_expression(item.clip, rate);
    format!(
        "[{input}:a]aformat=sample_fmts=fltp:sample_rates={AUDIO_HZ}:channel_layouts=stereo\
         {speed},asetpts=PTS-STARTPTS,volume='{volume}':eval=frame,adelay={}S:all=1[a{input}]",
        item.clip.start_time(rate).to_samples(AUDIO_HZ)
    )
}

fn volume_expression(clip: &Clip, rate: Rate) -> String {
    volume_expression_for(
        &clip.volume_keyframes,
        clip.volume,
        clip.fade_in,
        clip.fade_out,
        clip.start,
        clip.duration_frames(),
        rate,
    )
}

fn volume_expression_for(
    keyframes: &crate::KeyframeTrack,
    volume: f32,
    fade_in: i64,
    fade_out: i64,
    start_frame: i64,
    duration_frames: i64,
    rate: Rate,
) -> String {
    let keys = &keyframes.keyframes;
    let mut expression = if keys.is_empty() {
        format!("{:.6}", volume.clamp(0.0, 1.0))
    } else {
        let last = keys.last().expect("checked");
        let mut tail = format!("{:.6}", last.value.clamp(0.0, 1.0));
        for pair in keys.windows(2).rev() {
            let left = pair[0];
            let right = pair[1];
            let left_time = RationalTime::new(left.frame - start_frame, rate).to_seconds();
            let right_time = RationalTime::new(right.frame - start_frame, rate).to_seconds();
            let amount = format!(
                "max(0,min(1,(t-{left_time:.9})/{:.9}))",
                (right_time - left_time).max(1e-9)
            );
            let eased = match left.easing {
                crate::Easing::Linear => amount.clone(),
                crate::Easing::EaseIn => format!("({amount})*({amount})"),
                crate::Easing::EaseOut => format!("1-(1-({amount}))*(1-({amount}))"),
                crate::Easing::EaseInOut => format!(
                    "if(lt({amount},0.5),2*({amount})*({amount}),1-pow(-2*({amount})+2,2)/2)"
                ),
                crate::Easing::Hold => "0".into(),
            };
            let segment = format!(
                "{:.6}+({:.6}-{:.6})*({eased})",
                left.value, right.value, left.value
            );
            tail = format!("if(lt(t,{right_time:.9}),{segment},{tail})");
        }
        let first_time = RationalTime::new(keys[0].frame - start_frame, rate).to_seconds();
        format!("if(lt(t,{first_time:.9}),{:.6},{tail})", keys[0].value)
    };
    if fade_in > 0 {
        let duration = RationalTime::new(fade_in, rate).to_seconds();
        expression = format!("({expression})*min(1,max(0,t/{duration:.9}))");
    }
    if fade_out > 0 {
        let start = RationalTime::new(duration_frames - fade_out, rate).to_seconds();
        let duration = RationalTime::new(fade_out, rate).to_seconds();
        expression =
            format!("({expression})*min(1,max(0,({start:.9}+{duration:.9}-t)/{duration:.9}))");
    }
    expression
}

fn audio_placement_chain(item: &layout::AudioPlacement, input: usize, rate: Rate) -> String {
    let speed = speed_audio_filter(item.speed, item.preserve_pitch);
    let volume = volume_expression_for(
        &item.volume_keyframes,
        item.volume,
        item.fade_in,
        item.fade_out,
        item.start_frame,
        item.duration_frames,
        rate,
    );
    format!(
        "[{input}:a]aformat=sample_fmts=fltp:sample_rates={AUDIO_HZ}:channel_layouts=stereo\
         {speed},asetpts=PTS-STARTPTS,volume='{volume}':eval=frame,adelay={}S:all=1[a{input}]",
        RationalTime::new(item.start_frame, rate).to_samples(AUDIO_HZ)
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
    quality: Quality,
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
                format!("{}k", target_bitrate_kbps(width, height, rate, quality)),
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
                quality.crf().to_string(),
            ]);
        }
    }
    args.extend([
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-r".into(),
        rate.ratio_text(),
    ]);
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
    pub speed: f32,
    pub hwaccel: Option<&'a str>,
    pub crop: Crop,
    pub head_pad_frames: i64,
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
        speed,
        hwaccel,
        crop,
        head_pad_frames,
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
    let crop_filter = if crop.is_empty() {
        String::new()
    } else {
        format!(
            "crop=iw*{:.6}:ih*{:.6}:iw*{:.6}:ih*{:.6},",
            1.0 - crop.left - crop.right,
            1.0 - crop.top - crop.bottom,
            crop.left,
            crop.top,
        )
    };
    let pad_filter = if head_pad_frames > 0 {
        format!(
            "tpad=start_mode=clone:start_duration={:.9},",
            RationalTime::new(head_pad_frames, rate).to_seconds()
        )
    } else {
        String::new()
    };
    args.extend([
        "-vf".into(),
        format!("{crop_filter}scale={width}:{height},setpts=PTS/{speed:.6},{pad_filter}fps={fps}"),
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
    pub speed: f32,
    pub preserve_pitch: bool,
}

fn speed_audio_filter(speed: f32, preserve_pitch: bool) -> String {
    if (speed - 1.0).abs() <= f32::EPSILON {
        return String::new();
    }
    if !preserve_pitch {
        return format!(",asetrate={AUDIO_HZ}*{speed:.6},aresample={AUDIO_HZ}");
    }
    let mut remaining = speed.max(0.1);
    let mut stages = Vec::new();
    while remaining > 2.0 {
        stages.push(2.0);
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        stages.push(0.5);
        remaining /= 0.5;
    }
    stages.push(remaining);
    stages
        .into_iter()
        .map(|value| format!(",atempo={value:.6}"))
        .collect()
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
    let speed = speed_audio_filter(request.speed, request.preserve_pitch);
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
        format!("aformat=sample_fmts=flt:sample_rates={AUDIO_HZ}:channel_layouts=stereo{speed}"),
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
        args.extend([
            "-t".into(),
            secs(RationalTime::new(item.clip.source_duration_frames(), rate)),
        ]);
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

/// The audible timeline as a compact speech-recognition input. Speech models
/// gain nothing from video, stereo, or frequencies above the voice band, so
/// the temporary file is mono 16 kHz MP3 at 48 kbit/s.
pub fn analysis_audio_args(project: &Project, output: &str) -> Option<Vec<String>> {
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
        args.extend([
            "-t".into(),
            secs(RationalTime::new(item.clip.source_duration_frames(), rate)),
        ]);
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
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-b:a".into(),
        "48k".into(),
        "-map_metadata".into(),
        "-1".into(),
        output.into(),
    ]);
    Some(args)
}

pub fn analysis_chunk_args(
    input: &str,
    start_ms: u64,
    duration_ms: u64,
    output: &str,
) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", start_ms as f64 / 1000.0),
        "-t".into(),
        format!("{:.3}", duration_ms as f64 / 1000.0),
        "-i".into(),
        input.into(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-b:a".into(),
        "48k".into(),
        "-map_metadata".into(),
        "-1".into(),
        output.into(),
    ]
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

    let audio = layout::audio_placements(project);
    for item in &audio {
        args.extend(["-ss".into(), secs(item.in_time(rate))]);
        args.extend([
            "-t".into(),
            secs(RationalTime::new(
                (item.duration_frames as f64 * item.speed as f64).ceil() as i64,
                rate,
            )),
        ]);
        args.extend(["-i".into(), item.path.clone()]);
    }

    let has_audio = !audio.is_empty();
    if has_audio {
        let mut chains = Vec::new();
        let mut labels = Vec::new();
        for (index, item) in audio.iter().enumerate() {
            let input = index + 1;
            chains.push(audio_placement_chain(item, input, rate));
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
    args.extend(video_codec_args(accel, width, height, rate, preset.quality));
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
mod tests;
