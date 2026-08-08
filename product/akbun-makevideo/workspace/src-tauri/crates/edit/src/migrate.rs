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

use crate::{Asset, Clip, FORMAT_VERSION, Project, ProjectSettings, Rate, RationalTime, Track, TrackKind};
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
            tracks: wire
                .tracks
                .into_iter()
                .map(|track| Track {
                    id: track.id,
                    kind: track.kind,
                    name: track.name,
                    muted: track.muted,
                    hidden: track.hidden,
                    clips: track
                        .clips
                        .into_iter()
                        .map(|clip| Clip {
                            id: clip.id,
                            asset_id: clip.asset_id,
                            link_group: clip.link_group,
                            start: frames(clip.start, clip.start_ms, rate),
                            in_point: frames(clip.in_point, clip.in_ms, rate),
                            out_point: frames(clip.out_point, clip.out_ms, rate),
                            volume: clip.volume,
                            opacity: clip.opacity,
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
        assert_eq!(clip.volume, 1.0, "a field that never existed still defaults");
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
            "version": 2,
            "settings": {"width": 1080, "height": 1920, "rate": {"num": 24000, "den": 1001}},
            "tracks": [{"id": "V1", "kind": "video", "clips": [
                {"id": "c1", "assetId": "a1", "linkGroup": "g1", "start": 12, "in": 3, "out": 48, "volume": 0.5}
            ]}]
        }"#;
        let project: Project = serde_json::from_str(text).unwrap();
        assert_eq!(project.rate(), Rate::ntsc(24));
        let clip = &project.tracks[0].clips[0];
        assert_eq!((clip.start, clip.in_point, clip.out_point), (12, 3, 48));
        assert_eq!(clip.volume, 0.5);
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
        assert!(written.contains(r#""version":2"#), "{written}");
        assert!(written.contains(r#""rate":{"num":60,"den":1}"#), "{written}");
        assert!(written.contains(r#""start":30"#), "{written}");
        assert!(!written.contains("startMs"), "{written}");
        assert!(!written.contains("\"fps\""), "{written}");
        // And reading it back is the identity, so a save does not move a clip.
        let again: Project = serde_json::from_str(&written).unwrap();
        assert_eq!(again.tracks[0].clips[0].start, 30);
    }
}
