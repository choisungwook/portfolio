use super::*;

fn video(duration_ms: u64) -> Asset {
    Asset {
        id: "v".into(),
        path: "/m.mp4".into(),
        name: "m.mp4".into(),
        kind: AssetKind::Video,
        duration_ms,
        width: 1920,
        height: 1080,
        has_audio: true,
    }
}

fn clip(id: &str, start: i64, in_point: i64, out_point: i64) -> Clip {
    Clip {
        id: id.into(),
        asset_id: "v".into(),
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

fn with_clips(clips: Vec<Clip>) -> Project {
    let mut project = Project::new(ProjectSettings::default());
    project.assets.push(video(10_000));
    project.tracks[0].clips = clips;
    project
}

fn visual_item(id: &str, start: i64, duration: i64, z_index: i32) -> VisualItem {
    VisualItem {
        id: id.into(),
        start,
        duration,
        transform: VisualTransform {
            x: 0.0,
            y: 0.0,
            width: 320.0,
            height: 180.0,
            rotation: 0.0,
            opacity: 1.0,
        },
        animation: Default::default(),
        blend_mode: Default::default(),
        z_index,
        content: VisualContent::Shape {
            shape: ShapeKind::Rectangle,
            visual_style: VisualStyle::shape_default(),
            corner_radius: 0.0,
            start_arrow: false,
            end_arrow: false,
        },
    }
}

#[test]
fn the_extension_decides_the_kind_before_ffprobe_runs() {
    assert_eq!(AssetKind::from_path("/a/b.MP4"), Some(AssetKind::Video));
    assert_eq!(AssetKind::from_path("/a/b.wav"), Some(AssetKind::Audio));
    assert_eq!(AssetKind::from_path("/a/b.png"), Some(AssetKind::Image));
    assert_eq!(AssetKind::from_path("/a/b.txt"), None);
    assert_eq!(AssetKind::from_path("/a/noextension"), None);
}

#[test]
fn the_shortest_clip_is_a_tenth_of_a_second_rounded_up() {
    // 2.4 frames at 23.976, and rounding down would make the shortest clip
    // shorter than the length that was decided to be grabbable.
    assert_eq!(min_clip_frames(Rate::ntsc(24)), 3);
    assert_eq!(min_clip_frames(Rate::fps(30)), 3);
    assert_eq!(min_clip_frames(Rate::fps(60)), 6);
}

#[test]
fn a_track_takes_the_sound_of_a_video_but_not_its_picture() {
    let project = Project::new(ProjectSettings::default());
    let (video_track, audio_track) = (&project.tracks[0], &project.tracks[1]);
    let mut silent = video(1000);
    silent.has_audio = false;
    let mut still = video(0);
    still.kind = AssetKind::Image;

    assert!(video_track.accepts(&video(1000)));
    assert!(video_track.accepts(&still));
    assert!(audio_track.accepts(&video(1000)));
    assert!(!audio_track.accepts(&silent));
    assert!(!audio_track.accepts(&still));
}

#[test]
fn speed_derives_timeline_duration_without_changing_the_source_range() {
    let mut clip = clip("c1", 10, 20, 140);
    clip.speed = 2.0;
    assert_eq!(clip.source_duration_frames(), 120);
    assert_eq!(clip.duration_frames(), 60);
    assert_eq!(clip.end_frame(), 70);
    assert_eq!(clip.source_frame_at(25), 50);
}

#[test]
fn a_visual_transform_reads_all_property_tracks_at_one_frame() {
    let mut item = visual_item("i1", 0, 30, 0);
    item.animation.x.keyframes = vec![
        Keyframe {
            frame: 0,
            value: 0.0,
            easing: Easing::Linear,
        },
        Keyframe {
            frame: 20,
            value: 200.0,
            easing: Easing::Linear,
        },
    ];
    item.animation.opacity.keyframes = vec![
        Keyframe {
            frame: 0,
            value: 0.0,
            easing: Easing::EaseIn,
        },
        Keyframe {
            frame: 20,
            value: 1.0,
            easing: Easing::Linear,
        },
    ];
    let transform = item.transform_at(10);
    assert_eq!(transform.x, 100.0);
    assert_eq!(transform.opacity, 0.25);
    assert_eq!(transform.width, item.transform.width);
}

#[test]
fn a_drop_onto_an_occupied_stretch_lands_after_it() {
    let project = with_clips(vec![clip("c1", 0, 0, 60), clip("c2", 120, 0, 60)]);
    let track = &project.tracks[0];
    assert_eq!(track.free_start(0, 30, None), 60);
    assert_eq!(track.free_start(100, 60, None), 180);
    // Ignoring itself is what lets a clip be dragged a few frames without
    // being pushed off the end of where it already is.
    assert_eq!(track.free_start(10, 60, Some("c1")), 10);
}

#[test]
fn a_clip_with_no_length_is_refused() {
    let project = with_clips(vec![clip("c1", 0, 30, 30)]);
    assert!(project.validate().unwrap_err().contains("no length"));
}

#[test]
fn a_clip_reaching_past_its_source_is_refused() {
    // 10 seconds at 30 is 300 frames, so 301 is one frame too many.
    let project = with_clips(vec![clip("c1", 0, 0, 301)]);
    assert!(project.validate().unwrap_err().contains("past the end"));
    assert!(with_clips(vec![clip("c1", 0, 0, 300)]).validate().is_ok());
}

#[test]
fn overlapping_clips_are_refused() {
    let project = with_clips(vec![clip("c1", 0, 0, 60), clip("c2", 30, 0, 60)]);
    assert!(project.validate().unwrap_err().contains("overlap"));
}

#[test]
fn a_still_may_be_held_for_as_long_as_anybody_likes() {
    let mut project = with_clips(vec![clip("c1", 0, 0, 9000)]);
    project.assets[0].kind = AssetKind::Image;
    project.assets[0].duration_ms = 0;
    assert!(project.validate().is_ok());
}

#[test]
fn a_project_already_on_disk_is_repaired_rather_than_refused() {
    // What a file can hold: a clip that starts before zero, one with no
    // length left, one reaching past its source, and two that overlap.
    let mut project = with_clips(vec![
        clip("c1", -30, -5, 0),
        clip("c2", 10, 0, 900),
        clip("c3", 20, 0, 60),
    ]);
    project.repair();
    assert!(project.validate().is_ok(), "{:?}", project.tracks[0].clips);
    assert_eq!(project.tracks[0].clips[0].start, 0);
    assert!(project.tracks[0]
        .clips
        .iter()
        .all(|clip| clip.out_point <= 300));
}

#[test]
fn visual_items_overlap_and_draw_by_track_then_z_index() {
    let mut project = Project::new(ProjectSettings::default());
    project.tracks[0].visual_items = vec![
        visual_item("front", 0, 60, 20),
        visual_item("middle-b", 0, 60, 15),
        visual_item("back", 0, 60, 10),
        visual_item("middle-a", 0, 60, 15),
    ];
    project.tracks.push(Track {
        id: "t3".into(),
        kind: TrackKind::Video,
        name: "V2".into(),
        clips: Vec::new(),
        visual_items: vec![visual_item("top-track", 0, 60, -100)],
        subtitle_style: None,
        muted: false,
        hidden: false,
    });

    assert!(project.validate().is_ok());
    assert_eq!(
        project
            .visual_items_at(30)
            .iter()
            .map(|entry| entry.item.id.as_str())
            .collect::<Vec<_>>(),
        ["back", "middle-a", "middle-b", "front", "top-track"]
    );
    assert!(
        project.visual_items_at(60).is_empty(),
        "the end is exclusive"
    );
}

#[test]
fn a_visual_item_extends_the_timeline() {
    let mut project = Project::new(ProjectSettings::default());
    project.tracks[0].visual_items = vec![visual_item("title", 90, 60, 0)];
    assert_eq!(project.duration_frames(), 150);
}
