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
        lut_path: None,
        start,
        in_point,
        out_point,
        volume: 1.0,
        opacity: 1.0,
        speed: 1.0,
        preserve_pitch: true,
        denoise: 0.0,
        fade_in: 0,
        fade_out: 0,
        volume_keyframes: Default::default(),
        blend_mode: Default::default(),
    }
}

fn track(id: &str, kind: TrackKind, clips: Vec<Clip>) -> Track {
    Track {
        id: id.into(),
        kind,
        name: id.into(),
        clips,
        visual_items: Vec::new(),
        subtitle_style: None,
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
        transitions: Vec::new(),
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
        transitions: Vec::new(),
        markers: Vec::new(),
    };
    assert!(build_args(&project, "/out.mp4", Preset::FHD, None, &[]).is_err());
}

#[test]
fn a_clip_seeks_its_in_point_and_takes_its_own_length() {
    let args = build_args(&one_video_project(), "/out.mp4", Preset::FHD, None, &[]).unwrap();
    let text = joined(&args);
    assert!(
        text.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
        "{text}"
    );
    assert_eq!(args.last().unwrap(), "/out.mp4");
}

#[test]
fn the_clip_lands_at_its_timeline_position() {
    let args = build_args(&one_video_project(), "/out.mp4", Preset::FHD, None, &[]).unwrap();
    let filter = filter_of(&args);
    assert!(filter.contains("tpad=start_duration=2.000000"), "{filter}");
    assert!(
        filter.contains("enable='between(t,2.000000,5.000000)'"),
        "{filter}"
    );
}

/// The graph route burns text and shapes in from rasterized stills. The
/// still is an extra input above every clip; without this the CPU render
/// and the fallback silently dropped every layer the preview showed.
#[test]
fn a_visual_still_is_overlaid_above_every_clip_for_its_frames() {
    let visuals = [VisualInput {
        path: "/tmp/title-0.pam".into(),
        x: 96,
        y: 54,
        opacity: 1.0,
        start_frame: 90,
        end_frame: 120,
    }];
    let args = build_args(
        &one_video_project(),
        "/out.mp4",
        Preset::FHD,
        None,
        &visuals,
    )
    .unwrap();
    let text = joined(&args);
    // A looped still that lives until its own end, like an image clip.
    assert!(
        text.contains("-loop 1 -framerate 30 -t 4.000000 -i /tmp/title-0.pam"),
        "{text}"
    );
    let filter = filter_of(&args);
    assert!(
        filter.contains(
            "overlay=x=96:y=54:eof_action=pass:enable='between(t,3.000000,4.000000)'"
        ),
        "{filter}"
    );
    // Above the clip layer, and the last thing before the output format.
    assert!(filter.contains("[ov0][g0]"), "{filter}");
    assert!(filter.contains("[ovg0]format=yuv420p[vout]"), "{filter}");
    // Full opacity adds no mixer stage.
    assert!(!filter.contains("colorchannelmixer"), "{filter}");
}

/// A translucent layer keeps its opacity through the same mixer stage a
/// translucent clip uses.
#[test]
fn a_translucent_visual_still_gets_an_alpha_mixer() {
    let visuals = [VisualInput {
        path: "/tmp/shape-0.pam".into(),
        x: 0,
        y: 0,
        opacity: 0.5,
        start_frame: 0,
        end_frame: 30,
    }];
    let args = build_args(
        &one_video_project(),
        "/out.mp4",
        Preset::FHD,
        None,
        &visuals,
    )
    .unwrap();
    assert!(
        filter_of(&args).contains("colorchannelmixer=aa=0.500"),
        "{}",
        filter_of(&args)
    );
}

#[test]
fn the_base_runs_for_the_whole_timeline() {
    let args = build_args(&one_video_project(), "/out.mp4", Preset::FHD, None, &[]).unwrap();
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
    let args = build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap();
    let filter = filter_of(&args);
    assert!(
        filter.contains("color=c=black:s=1920x1080:r=30000/1001"),
        "{filter}"
    );
    assert!(filter.contains("fps=30000/1001"), "{filter}");
    assert!(joined(&args).contains("-r 30000/1001"), "{}", joined(&args));
    // 150 frames of 29.97 is 5.005 seconds, not 5.
    assert!(
        joined(&args).contains("-t 5.005000 -movflags"),
        "{}",
        joined(&args)
    );
}

#[test]
fn a_silent_asset_produces_no_audio_output() {
    let mut project = one_video_project();
    project.assets[0].has_audio = false;
    let args = build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap();
    assert!(!joined(&args).contains("[aout]"));
    assert!(!joined(&args).contains("-c:a"));
}

#[test]
fn denoise_is_off_at_zero_and_scales_with_strength() {
    assert_eq!(denoise_audio_filter(0.0), "");
    assert_eq!(denoise_audio_filter(f32::NAN), "");
    assert_eq!(denoise_audio_filter(0.5), ",afftdn=nr=24.0:nf=-42.5");
    assert_eq!(denoise_audio_filter(4.0), ",afftdn=nr=36.0:nf=-30.0");
}

#[test]
fn preview_and_render_apply_the_same_denoise_filter() {
    let mut project = one_video_project();
    project.tracks[0].clips[0].denoise = 0.5;
    let filter = filter_of(&build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap());
    let rate = Rate::fps(30);
    let decoder = audio_decoder_args(&DecodeAudio {
        path: "/media/a1.mp4",
        in_time: RationalTime::new(0, rate),
        duration: RationalTime::new(90, rate),
        speed: 2.0,
        preserve_pitch: true,
        denoise: 0.5,
    })
    .join(" ");
    let expected = denoise_audio_filter(0.5);
    assert!(filter.contains(&expected), "{filter}");
    // Before the speed change on both sides.
    assert!(decoder.contains(&format!("stereo{expected},atempo")), "{decoder}");
}

#[test]
fn audio_is_delayed_by_a_sample_count_rather_than_a_millisecond_count() {
    let args = build_args(&one_video_project(), "/out.mp4", Preset::FHD, None, &[]).unwrap();
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
    let filter = filter_of(&build_args(&project, "/o.mp4", Preset::FHD, None, &[]).unwrap());
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
    let args = build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap();
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
        transitions: Vec::new(),
        markers: Vec::new(),
    };
    let filter = filter_of(&build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap());
    assert!(filter.contains("[base][v0]overlay"), "{filter}");
    assert!(filter.contains("[ov0][v1]overlay"), "{filter}");
    assert!(filter.contains("[ov1]format=yuv420p[vout]"), "{filter}");
}

#[test]
fn a_hidden_track_drops_out_of_the_render_entirely() {
    let mut project = one_video_project();
    project.tracks[0].hidden = true;
    assert!(build_args(&project, "/out.mp4", Preset::FHD, None, &[]).is_err());
}

#[test]
fn muting_a_video_track_keeps_its_picture() {
    let mut project = one_video_project();
    project.tracks[0].muted = true;
    let args = build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap();
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
        transitions: Vec::new(),
        markers: Vec::new(),
    };
    let args = build_args(&project, "/out.mp4", Preset::FHD, None, &[]).unwrap();
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
        !filter_of(&build_args(&project, "/o.mp4", Preset::FHD, None, &[]).unwrap())
            .contains("colorchannelmixer")
    );
    project.tracks[0].clips[0].opacity = 0.5;
    assert!(
        filter_of(&build_args(&project, "/o.mp4", Preset::FHD, None, &[]).unwrap())
            .contains("colorchannelmixer=aa=0.500")
    );
}

#[test]
fn the_preset_sets_the_long_edge() {
    assert_eq!(
        output_size(&settings(1920, 1080), Preset::FHD),
        (1920, 1080)
    );
    assert_eq!(
        output_size(&settings(1920, 1080), Preset::UHD_4K),
        (3840, 2160)
    );
    // A vertical project keeps its shape instead of being letterboxed.
    assert_eq!(
        output_size(&settings(1080, 1920), Preset::FHD),
        (1080, 1920)
    );
    assert_eq!(
        output_size(&settings(1080, 1920), Preset::UHD_4K),
        (2160, 3840)
    );
    assert_eq!(
        output_size(&settings(1440, 1080), Preset::FHD),
        (1920, 1440)
    );
}

#[test]
fn every_derived_size_is_even_because_h264_demands_it() {
    // 1920x1079 would give an odd height if it were not rounded.
    let (width, height) = output_size(&settings(1920, 1079), Preset::FHD);
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
    let args = build_args(
        &one_video_project(),
        "/o.mp4",
        Preset::FHD,
        Some(&hardware),
        &[],
    )
    .unwrap();
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
    let args = build_args(
        &one_video_project(),
        "/o.mp4",
        Preset::FHD,
        Some(&hardware),
        &[],
    )
    .unwrap();
    assert!(joined(&args).contains("-hwaccel videotoolbox -ss 1.000000"));
}

#[test]
fn a_still_is_not_given_a_decoder_it_does_not_use() {
    let mut project = one_video_project();
    project.assets[0].kind = AssetKind::Image;
    project.assets[0].has_audio = false;
    let hardware = videotoolbox();
    let args = build_args(&project, "/o.mp4", Preset::FHD, Some(&hardware), &[]).unwrap();
    assert!(!joined(&args).contains("-hwaccel"), "{}", joined(&args));
}

#[test]
fn an_encoder_without_a_decoder_still_encodes_on_the_gpu() {
    let hardware = Acceleration {
        encoder: "h264_nvenc".into(),
        hwaccel: None,
        label: "NVIDIA NVENC".into(),
    };
    let args = build_args(
        &one_video_project(),
        "/o.mp4",
        Preset::FHD,
        Some(&hardware),
        &[],
    )
    .unwrap();
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
    let cpu = build_args(&one_video_project(), "/o.mp4", Preset::FHD, None, &[]).unwrap();
    let gpu = build_args(
        &one_video_project(),
        "/o.mp4",
        Preset::FHD,
        Some(&hardware),
        &[],
    )
    .unwrap();
    assert_eq!(filter_of(&cpu), filter_of(&gpu));
}

#[test]
fn the_bitrate_follows_the_frame_and_stays_in_range() {
    assert_eq!(target_bitrate_kbps(1920, 1080, Rate::fps(30), Quality::Medium), 7465);
    assert_eq!(target_bitrate_kbps(3840, 2160, Rate::fps(30), Quality::Medium), 29860);
    // 29.97 asks for slightly less than 30 does, which it should.
    assert_eq!(target_bitrate_kbps(1920, 1080, Rate::ntsc(30), Quality::Medium), 7458);
    // A tiny frame still gets something usable, a huge one stays sane.
    assert_eq!(target_bitrate_kbps(64, 64, Rate::fps(24), Quality::Medium), 2_000);
    assert_eq!(target_bitrate_kbps(7680, 4320, Rate::fps(60), Quality::Medium), 80_000);
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
        speed: 1.0,
        hwaccel: None,
        crop: Crop::default(),
        head_pad_frames: 0,
    })
    .join(" ");
    assert!(
        args.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
        "{args}"
    );
    // The size comes from layout::fit_rect, and fps= is what keeps the
    // frame count in step with the timeline.
    assert!(
        args.contains("-vf scale=1440:1080,setpts=PTS/1.000000,fps=30"),
        "{args}"
    );
    assert!(args.ends_with("-f rawvideo -pix_fmt rgba -"), "{args}");
}

#[test]
fn speed_uses_the_selected_pitch_policy() {
    assert_eq!(
        speed_audio_filter(2.5, true),
        ",atempo=2.000000,atempo=1.250000"
    );
    assert_eq!(
        speed_audio_filter(2.0, false),
        ",asetrate=48000*2.000000,aresample=48000"
    );
}

#[test]
fn volume_keyframes_and_fades_become_one_expression() {
    let mut clip = clip("c1", "a1", 30, 0, 60);
    clip.fade_in = 5;
    clip.fade_out = 5;
    clip.volume_keyframes.keyframes = vec![
        crate::Keyframe {
            frame: 30,
            value: 0.25,
            easing: crate::Easing::Linear,
        },
        crate::Keyframe {
            frame: 45,
            value: 1.0,
            easing: crate::Easing::EaseOut,
        },
    ];
    let expression = volume_expression(&clip, Rate::fps(30));
    assert!(expression.contains("0.250000+(1.000000-0.250000)"));
    assert!(expression.contains("t/0.166666667"));
    assert!(expression.contains("-t)/0.166666667"));
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
        speed: 1.0,
        hwaccel: None,
        crop: Crop::default(),
        head_pad_frames: 0,
    })
    .join(" ");
    assert!(args.contains("-ss 1.001000 -t 1.001000"), "{args}");
    assert!(args.contains("fps=24000/1001"), "{args}");
}

#[test]
fn a_transition_decoder_holds_the_first_frame_for_missing_handles() {
    let rate = Rate::fps(30);
    let args = decoder_args(&Decode {
        path: "/m/a.mp4",
        kind: AssetKind::Video,
        in_time: RationalTime::zero(rate),
        duration: RationalTime::new(1, rate),
        width: 640,
        height: 360,
        rate,
        speed: 1.0,
        hwaccel: None,
        crop: Crop::default(),
        head_pad_frames: 15,
    })
    .join(" ");
    assert!(
        args.contains("tpad=start_mode=clone:start_duration=0.500000000"),
        "{args}"
    );
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
        speed: 1.0,
        hwaccel: None,
        crop: Crop::default(),
        head_pad_frames: 0,
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
        speed: 1.0,
        hwaccel: Some("videotoolbox"),
        crop: Crop::default(),
        head_pad_frames: 0,
    })
    .join(" ");
    assert!(args.contains("-hwaccel videotoolbox -ss"), "{args}");
}

#[test]
fn the_encoder_takes_the_picture_from_the_pipe_and_the_sound_from_the_files() {
    let args = encoder_args(&one_video_project(), "/out.mp4", Preset::FHD, None).unwrap();
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
    let args = encoder_args(&project, "/out.mp4", Preset::FHD, None).unwrap();
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
    let graph = joined(&build_args(&project, "/o.mp4", Preset::FHD, None, &[]).unwrap());
    let piped = joined(&encoder_args(&project, "/o.mp4", Preset::FHD, None).unwrap());
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
        encoder_args(&one_video_project(), "/o.mp4", Preset::FHD, Some(&hardware)).unwrap();
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
        transitions: Vec::new(),
        markers: Vec::new(),
    };
    assert!(encoder_args(&project, "/o.mp4", Preset::FHD, None).is_err());
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
        speed: 1.0,
        preserve_pitch: true,
        denoise: 0.0,
    })
    .join(" ");
    assert!(
        args.contains("-ss 1.000000 -t 3.000000 -i /media/a1.mp4"),
        "{args}"
    );
    assert!(args.contains("sample_rates=48000"), "{args}");
    assert!(args.contains("channel_layouts=stereo"), "{args}");
    assert!(
        args.contains("-vn"),
        "a video input is opened for its sound"
    );
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
    let exported =
        filter_of(&build_args(&one_video_project(), "/o.mp4", Preset::FHD, None, &[]).unwrap());
    assert!(exported.contains("adelay=96000S:all=1"), "{exported}");
    assert!(filter.contains("adelay=96000S:all=1"), "{filter}");
    assert!(filter.contains("amix=inputs=1:normalize=0"), "{filter}");
    assert!(text.contains("-map [aout]"), "{text}");
    assert!(text.contains("-f f32le -ac 2 -ar 48000"), "{text}");
    assert!(
        text.contains("-t 5.000000"),
        "the timeline bounds it: {text}"
    );
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
        assets: vec![
            asset("a1", AssetKind::Video, true),
            asset("a2", AssetKind::Audio, true),
        ],
        tracks: vec![
            track("V1", TrackKind::Video, vec![clip("c1", "a1", 0, 0, 60)]),
            track("A1", TrackKind::Audio, vec![clip("c2", "a2", 30, 0, 60)]),
        ],
        transitions: Vec::new(),
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
fn speech_analysis_uses_a_small_mono_mp3() {
    let text = joined(&analysis_audio_args(&one_video_project(), "/tmp/analysis.mp3").unwrap());
    assert!(text.contains("-map [aout]"), "{text}");
    assert!(text.contains("-ac 1 -ar 16000 -b:a 48k"), "{text}");
    assert!(text.ends_with("/tmp/analysis.mp3"), "{text}");
}

#[test]
fn a_transcription_chunk_is_reencoded_at_exact_millisecond_bounds() {
    let text = joined(&analysis_chunk_args(
        "/tmp/analysis.mp3",
        1250,
        55_000,
        "/tmp/chunk.mp3",
    ));
    assert!(
        text.contains("-ss 1.250 -t 55.000 -i /tmp/analysis.mp3"),
        "{text}"
    );
    assert!(text.contains("-ac 1 -ar 16000 -b:a 48k"), "{text}");
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

#[test]
fn quality_moves_crf_and_hardware_bitrate_together() {
    let project = one_video_project();
    let high = build_args(&project, "/o.mp4", Preset::FHD.with_quality(Quality::High), None, &[]).unwrap();
    let low = build_args(&project, "/o.mp4", Preset::FHD.with_quality(Quality::Low), None, &[]).unwrap();
    assert!(high.join(" ").contains("-crf 17"));
    assert!(low.join(" ").contains("-crf 24"));
    let fast = target_bitrate_kbps(1920, 1080, Rate::fps(30), Quality::Low);
    let best = target_bitrate_kbps(1920, 1080, Rate::fps(30), Quality::High);
    assert!(fast < 7465 && 7465 < best, "{fast} {best}");
}

#[test]
fn hd_preset_keeps_the_project_shape() {
    assert_eq!(output_size(&settings(1920, 1080), Preset::HD), (1280, 720));
    assert_eq!(output_size(&settings(1080, 1920), Preset::HD), (720, 1280));
    assert_eq!(Preset::parse("720").unwrap(), Preset::HD);
    assert!(Quality::parse("ultra").is_err());
}
