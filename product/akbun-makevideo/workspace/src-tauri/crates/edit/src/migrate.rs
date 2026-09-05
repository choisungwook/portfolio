//! Reading a project file whatever version wrote it.
//!
//! Version 1 measured every time in whole milliseconds and held the frame rate
//! as a single integer. Version 2 counts frames on a rate of two integers. A
//! project already on someone's disk has to keep opening, so every file goes
//! through the shapes here on the way in and the conversion happens once, at
//! the edge, rather than being remembered everywhere afterwards.
//!
//! Which version a file is does not have to be believed: the two formats use
//! different keys, so a clip that has `startMs` is a version 1 clip and a clip
//! that has `start` is a version 2 one. `version` is there for a reader, and
//! for the next format after this one.

use crate::{
    Asset, BlendMode, Clip, KeyframeTrack, Marker, Project, ProjectSettings, Rate, RationalTime,
    Track, TrackKind, Transition, VisualItem, FORMAT_VERSION,
};
use serde::Deserialize;

fn one() -> f32 {
    1.0
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireProject {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    settings: WireSettings,
    #[serde(default)]
    assets: Vec<Asset>,
    #[serde(default)]
    tracks: Vec<WireTrack>,
    #[serde(default)]
    transitions: Vec<Transition>,
    #[serde(default)]
    markers: Vec<Marker>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSettings {
    width: Option<u32>,
    height: Option<u32>,
    /// Version 2.
    rate: Option<Rate>,
    /// Version 1, where it was a whole number of frames per second and 29.97
    /// could not be written at all.
    fps: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireTrack {
    id: String,
    kind: TrackKind,
    #[serde(default)]
    name: String,
    #[serde(default)]
    clips: Vec<WireClip>,
    #[serde(default)]
    visual_items: Vec<VisualItem>,
    #[serde(default)]
    muted: bool,
    #[serde(default)]
    hidden: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireClip {
    id: String,
    asset_id: String,
    #[serde(default)]
    link_group: Option<String>,
    #[serde(default)]
    lut_path: Option<String>,
    start: Option<i64>,
    #[serde(rename = "in")]
    in_point: Option<i64>,
    #[serde(rename = "out")]
    out_point: Option<i64>,
    start_ms: Option<i64>,
    in_ms: Option<i64>,
    out_ms: Option<i64>,
    #[serde(default = "one")]
    volume: f32,
    #[serde(default = "one")]
    opacity: f32,
    #[serde(default = "one")]
    speed: f32,
    #[serde(default = "true_value")]
    preserve_pitch: bool,
    #[serde(default)]
    fade_in: i64,
    #[serde(default)]
    fade_out: i64,
    #[serde(default)]
    volume_keyframes: KeyframeTrack,
    #[serde(default)]
    blend_mode: BlendMode,
}

fn true_value() -> bool {
    true
}

/// A frame count if the file already had one, otherwise the nearest frame to
/// the millisecond it used to be.
fn frames(frames: Option<i64>, millis: Option<i64>, rate: Rate) -> i64 {
    match (frames, millis) {
        (Some(value), _) => value,
        (None, Some(value)) => RationalTime::from_millis(value, rate).value(),
        (None, None) => 0,
    }
}

impl From<WireProject> for Project {
    fn from(wire: WireProject) -> Project {
        let defaults = ProjectSettings::default();
        // A version 1 file holds a decimal, so it goes through `nearest`: a
        // file that says 29.97 meant 30000/1001 and storing 29.97 as written
        // would keep the approximation this format exists to remove.
        let rate = wire
            .settings
            .rate
            .or_else(|| wire.settings.fps.map(Rate::nearest))
            .unwrap_or(defaults.rate);
        // `version` is read so that a file carrying one is accepted, and so
        // that the next format has somewhere to look. Nothing here is decided
        // from it: the keys on the clip are what say which format it is in.
        let _ = wire.version;
        Project {
            version: FORMAT_VERSION,
            settings: ProjectSettings {
                width: wire.settings.width.unwrap_or(defaults.width),
                height: wire.settings.height.unwrap_or(defaults.height),
                rate,
            },
            assets: wire.assets,
            transitions: wire.transitions,
            markers: wire.markers,
            tracks: wire
                .tracks
                .into_iter()
                .map(|track| Track {
                    id: track.id,
                    kind: track.kind,
                    name: track.name,
                    muted: track.muted,
                    hidden: track.hidden,
                    visual_items: track.visual_items,
                    subtitle_style: None,
                    clips: track
                        .clips
                        .into_iter()
                        .map(|clip| Clip {
                            id: clip.id,
                            asset_id: clip.asset_id,
                            link_group: clip.link_group,
                            lut_path: clip.lut_path,
                            start: frames(clip.start, clip.start_ms, rate),
                            in_point: frames(clip.in_point, clip.in_ms, rate),
                            out_point: frames(clip.out_point, clip.out_ms, rate),
                            volume: clip.volume,
                            opacity: clip.opacity,
                            speed: clip.speed,
                            preserve_pitch: clip.preserve_pitch,
                            fade_in: clip.fade_in,
                            fade_out: clip.fade_out,
                            volume_keyframes: clip.volume_keyframes,
                            blend_mode: clip.blend_mode,
                        })
                        .collect(),
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_millisecond_project_opens_as_frames() {
        let text = r#"{
            "version": 1,
            "settings": {"width": 1920, "height": 1080, "fps": 30},
            "assets": [{"id": "a1", "path": "/m.mp4", "kind": "video", "hasAudio": true}],
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "startMs": 2000, "inMs": 1000, "outMs": 4000}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.version, FORMAT_VERSION);
        assert_eq!(project.rate(), Rate::fps(30));
        let clip = &project.tracks[0].clips[0];
        assert_eq!((clip.start, clip.in_point, clip.out_point), (60, 30, 120));
        assert_eq!(
            clip.volume, 1.0,
            "a field that never existed still defaults"
        );
    }

    #[test]
    fn a_decimal_frame_rate_in_an_old_file_becomes_the_ratio() {
        // Version 1 held fps as an integer, but a file edited by hand — or one
        // written by anything else — can still say 29.97, and it means 30000
        // over 1001.
        let text = r#"{
            "version": 1,
            "settings": {"width": 1920, "height": 1080, "fps": 29.97},
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "startMs": 1001, "inMs": 0, "outMs": 1001}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.rate(), Rate::ntsc(30));
        // 1001 ms of 29.97 is exactly 30 frames, which is the arithmetic the
        // old model could not do.
        assert_eq!(project.tracks[0].clips[0].start, 30);
    }

    #[test]
    fn todays_format_passes_straight_through() {
        let text = r#"{
            "version": 4,
            "settings": {"width": 1080, "height": 1920, "rate": {"num": 24000, "den": 1001}},
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "linkGroup": "g1", "start": 12, "in": 3, "out": 48,
                 "volume": 0.5, "speed": 2.0, "preservePitch": false, "fadeIn": 3, "fadeOut": 4,
                 "blendMode": "multiply", "volumeKeyframes": {"keyframes": [{"frame": 12, "value": 0.25, "easing": "linear"}]}}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.rate(), Rate::ntsc(24));
        let clip = &project.tracks[0].clips[0];
        assert_eq!((clip.start, clip.in_point, clip.out_point), (12, 3, 48));
        assert_eq!(clip.volume, 0.5);
        assert_eq!(clip.speed, 2.0);
        assert!(!clip.preserve_pitch);
        assert_eq!((clip.fade_in, clip.fade_out), (3, 4));
        assert_eq!(clip.blend_mode, BlendMode::Multiply);
        assert_eq!(clip.volume_keyframes.keyframes[0].value, 0.25);
        assert_eq!(clip.link_group.as_deref(), Some("g1"));
    }

    #[test]
    fn a_file_with_nothing_in_it_opens_on_the_defaults() {
        let project: Project = serde_json::from_str("{}").unwrap();
        assert_eq!(project.rate(), Rate::fps(30));
        assert_eq!(project.settings.width, 1920);
        assert!(project.tracks.is_empty());
        assert_eq!(project.version, FORMAT_VERSION);
    }

    #[test]
    fn a_track_from_before_visual_items_gets_an_empty_list() {
        let project: Project = serde_json::from_str(
            r#"{
                "version": 2,
                "settings": {"rate": {"num": 30, "den": 1}},
                "tracks": [{"id": "V1", "kind": "video", "clips": []}]
            }"#,
        )
        .unwrap();
        assert!(project.tracks[0].visual_items.is_empty());
    }

    #[test]
    fn visual_content_uses_the_page_camel_case_shape() {
        let text = r#"{"kind":"videoOverlay","assetId":"a1"}"#;
        let content: crate::VisualContent = serde_json::from_str(text).unwrap();
        assert_eq!(
            content,
            crate::VisualContent::VideoOverlay {
                asset_id: "a1".into(),
                in_point: 0,
                crop: Default::default(),
                corner_radius: 0.0,
                border: None,
                audio_enabled: false,
            }
        );
        assert_eq!(
            serde_json::to_string(&content).unwrap(),
            r#"{"kind":"videoOverlay","assetId":"a1","inPoint":0,"crop":{"left":0.0,"top":0.0,"right":0.0,"bottom":0.0},"cornerRadius":0.0,"border":null,"audioEnabled":false}"#
        );
    }

    #[test]
    fn an_early_shape_without_style_opens_with_editable_defaults() {
        let content: crate::VisualContent = serde_json::from_str(r#"{"kind":"shape"}"#).unwrap();
        let crate::VisualContent::Shape {
            shape,
            visual_style,
            ..
        } = content
        else {
            panic!("expected a shape");
        };
        assert_eq!(shape, crate::ShapeKind::Rectangle);
        assert_eq!(visual_style.stroke.unwrap().width, 4.0);
    }

    #[test]
    fn legacy_shape_and_text_colours_become_paints_and_old_fields_are_not_written() {
        let shape: crate::VisualContent = serde_json::from_str(
            r##"{"kind":"shape","shape":"rectangle","fill":"#112233","stroke":"#445566","strokeWidth":7,"cornerRadius":12}"##,
        )
        .unwrap();
        let crate::VisualContent::Shape {
            shape: kind,
            visual_style,
            ..
        } = &shape
        else {
            panic!("expected a shape");
        };
        assert_eq!(*kind, crate::ShapeKind::RoundedRectangle);
        assert_eq!(visual_style.fills, vec![crate::Paint::solid("#112233")]);
        assert_eq!(visual_style.stroke.as_ref().unwrap().width, 7.0);
        let written = serde_json::to_string(&shape).unwrap();
        assert!(written.contains(r##""fills":[{"kind":"solid","color":"#112233"}]"##));
        assert!(!written.contains(r##""fill":"#112233""##));
        assert!(!written.contains("strokeWidth"));

        let text: crate::VisualContent = serde_json::from_str(
            r##"{"kind":"text","text":"title","style":{"color":"#abcdef","strokeColor":"#010203","strokeWidth":2,"shadowColor":"#00000080","shadowX":3,"shadowY":4}}"##,
        )
        .unwrap();
        let crate::VisualContent::Text { style, .. } = &text else {
            panic!("expected text");
        };
        assert_eq!(
            style.visual_style.fills,
            vec![crate::Paint::solid("#abcdef")]
        );
        assert_eq!(style.visual_style.stroke.as_ref().unwrap().width, 2.0);
        assert_eq!(style.visual_style.shadow.as_ref().unwrap().x, 3.0);
        let written = serde_json::to_string(&text).unwrap();
        assert!(!written.contains("strokeColor"));
        assert!(!written.contains("shadowColor"));
    }

    #[test]
    fn what_comes_back_out_is_todays_format_only() {
        let text = r#"{
            "version": 1,
            "settings": {"width": 1920, "height": 1080, "fps": 60},
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "startMs": 500, "inMs": 0, "outMs": 1000}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        let written = serde_json::to_string(&project).unwrap();
        assert!(written.contains(r#""version":5"#), "{written}");
        assert!(
            written.contains(r#""rate":{"num":60,"den":1}"#),
            "{written}"
        );
        assert!(written.contains(r#""start":30"#), "{written}");
        assert!(!written.contains("startMs"), "{written}");
        assert!(!written.contains("\"fps\""), "{written}");
        // And reading it back is the identity, so a save does not move a clip.
        let again: Project = serde_json::from_str(&written).unwrap();
        assert_eq!(again.tracks[0].clips[0].start, 30);
    }
}
