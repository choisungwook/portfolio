//! The project, and the arithmetic of editing it.
//!
//! This crate owns the editing model. It used to live in `src/timeline.js` and
//! Rust read the same JSON back for the render; now the page sends a
//! [`Command`](command::Command) and redraws from the state that comes back.
//! `adr/2026-08-edit-model-in-rust.md` says why the ownership moved, and what
//! the page kept: a drag still answers on the next frame because the page draws
//! the moving clip itself and only sends a command when the mouse comes up.
//!
//! Three things live here and nowhere else.
//!
//! * The types a project file holds, and the migration that opens an older one.
//! * The invariants a clip has to satisfy. A clip with no length, or one that
//!   reaches past the end of its source, is a state that shows up in the middle
//!   of a render rather than on the screen, so it is refused at the edit.
//! * Every operation, as a command that knows its own inverse. That is what
//!   makes undo cost what the edit touched rather than a copy of the project.
//!
//! Every time in here is a frame count on `settings.rate`. Nothing divides to
//! get one and nothing rounds to store one; the makevideo-time crate says why
//! that matters.

pub mod animation;
pub mod ai_plan;
pub mod command;
pub mod document;
pub mod migrate;

pub use animation::{Easing, Keyframe, KeyframeTrack, VisualAnimation, VisualProperty};
pub use command::{ClipAt, Command, Edge, FrameRange, MarkerAt, TransitionAt, VisualItemAt};
pub use document::{Document, DocumentState};
pub use makevideo_time::{Rate, RationalTime};

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// What `version` a project file written today holds. Version 1 measured
/// everything in whole milliseconds; `migrate` turns one of those into this on
/// the way in, so a project saved before this existed still opens.
pub const FORMAT_VERSION: u32 = 5;

/// Four of each is as many as the timeline header has room to name, and a
/// timeline that needs a fifth video track is asking for a different app.
pub const MAX_TRACKS_PER_KIND: usize = 4;

/// Below this a clip is a sliver nobody can grab again, so trims and splits
/// refuse to produce one. Stated in seconds because it is a fact about fingers
/// rather than about frames: at 23.976 a tenth of a second is 2.4 frames.
pub const MIN_CLIP_SECONDS: f64 = 0.1;

/// A still has no length of its own, so it gets one when it lands on a track.
pub const DEFAULT_IMAGE_SECONDS: f64 = 5.0;

/// Rounded up, so the constant above is a floor rather than an average: at
/// 23.976 a tenth of a second is 2.4 frames, and rounding to 2 would make the
/// shortest clip shorter than the length that was decided to be grabbable.
pub fn min_clip_frames(rate: Rate) -> i64 {
    (MIN_CLIP_SECONDS * rate.as_f64()).ceil().max(1.0) as i64
}

/// Missing fields deserialize to these, so a project file written by an older
/// version still opens instead of failing at the first unknown clip.
fn one() -> f32 {
    1.0
}

fn true_value() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
}

/// An asset's identity is its path, hashed. Importing the same file twice
/// therefore produces the same id and the library shows it once, and a project
/// reopened next week still points its clips at the same rows.
pub fn asset_id(path: &str) -> String {
    // FNV-1a. Not a security hash; it only has to be stable and short.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in path.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("as{hash:016x}")
}

/// Deserialized through `migrate::WireProject`, which is what turns a
/// millisecond file into this one. Serializing writes today's format only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "migrate::WireProject")]
pub struct Project {
    /// The storage format, not the app version.
    pub version: u32,
    pub settings: ProjectSettings,
    pub assets: Vec<Asset>,
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub transitions: Vec<Transition>,
    #[serde(default)]
    pub markers: Vec<Marker>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub width: u32,
    pub height: u32,
    /// The timebase. Every clip time in the file is a count of these frames,
    /// which is why it is two integers: 29.97 kept as a decimal would put the
    /// approximation straight back.
    pub rate: Rate,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        ProjectSettings {
            width: 1920,
            height: 1080,
            rate: Rate::fps(30),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    Video,
    Audio,
    Image,
}

impl AssetKind {
    /// The extension is the only thing available before ffprobe runs, and it is
    /// also the fallback when ffprobe is not installed at all.
    pub fn from_path(path: &str) -> Option<AssetKind> {
        let extension = path.rsplit_once('.')?.1.to_ascii_lowercase();
        match extension.as_str() {
            "mp4" | "mov" | "m4v" | "mkv" | "webm" | "avi" | "mpg" | "mpeg" | "wmv" | "flv" => {
                Some(AssetKind::Video)
            }
            "mp3" | "wav" | "m4a" | "aac" | "flac" | "ogg" | "opus" | "aiff" | "aif" | "wma" => {
                Some(AssetKind::Audio)
            }
            "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff" | "heic" => {
                Some(AssetKind::Image)
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub path: String,
    #[serde(default)]
    pub name: String,
    pub kind: AssetKind,
    /// What ffprobe measured. That is a property of the file rather than of the
    /// timeline, so it stays in milliseconds and becomes frames the moment it
    /// lands on a track.
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub has_audio: bool,
}

impl Asset {
    /// How many frames of the project this asset lasts.
    pub fn duration_frames(&self, rate: Rate) -> i64 {
        RationalTime::from_millis(self.duration_ms as i64, rate).value()
    }

    /// How long a clip of it starts out. A still has no length of its own, and
    /// neither does a file ffprobe was not there to measure; the page fills the
    /// second one in from the media element once it loads.
    pub fn initial_clip_frames(&self, rate: Rate) -> i64 {
        let fallback = (DEFAULT_IMAGE_SECONDS * rate.as_f64()).round() as i64;
        if self.kind == AssetKind::Image || self.duration_ms == 0 {
            return fallback.max(1);
        }
        self.duration_frames(rate).max(1)
    }

    /// How far into the source a clip may reach, or None when nothing knows.
    /// A still can be held on screen for as long as anybody likes, so it has no
    /// limit at all.
    pub fn source_limit_frames(&self, rate: Rate) -> Option<i64> {
        if self.kind == AssetKind::Image || self.duration_ms == 0 {
            return None;
        }
        Some(self.duration_frames(rate).max(1))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
    Subtitle,
}

impl TrackKind {
    /// V1, V2, A1. The number is what the timeline header shows, so removing a
    /// track has to leave the remaining names in step with their positions —
    /// which is why only the last track of a kind can go.
    pub fn name_for(self, index: usize) -> String {
        let letter = match self {
            TrackKind::Video => 'V',
            TrackKind::Audio => 'A',
            TrackKind::Subtitle => 'S',
        };
        format!("{letter}{}", index + 1)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub kind: TrackKind,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub clips: Vec<Clip>,
    /// Elements drawn over the track's clips. They may overlap in time; their
    /// `z_index` decides their order within this track.
    #[serde(default)]
    pub visual_items: Vec<VisualItem>,
    /// One style for the whole subtitle track. Individual subtitle entries
    /// keep only their timing and text.
    #[serde(default)]
    pub subtitle_style: Option<TextStyle>,
    /// An audio track that contributes nothing, or the audio of a video track.
    #[serde(default)]
    pub muted: bool,
    /// A video track that draws nothing. Its audio goes silent with it, which
    /// is the whole point of hiding a track while checking what is underneath.
    #[serde(default)]
    pub hidden: bool,
}

impl Track {
    /// Whether this track puts anything at all into the preview or the render.
    /// The same rule decides the timeline length, so it lives in one place: a
    /// hidden video track is out entirely and so is a muted audio one, while a
    /// muted video track still draws.
    pub fn contributes(&self) -> bool {
        if self.hidden {
            return false;
        }
        !(self.kind == TrackKind::Audio && self.muted)
    }

    /// What this track will take. A video with sound can go on an audio track,
    /// which is how you use the sound of a take without its picture.
    pub fn accepts(&self, asset: &Asset) -> bool {
        match self.kind {
            TrackKind::Video => matches!(asset.kind, AssetKind::Video | AssetKind::Image),
            TrackKind::Audio => {
                asset.kind == AssetKind::Audio
                    || (asset.kind == AssetKind::Video && asset.has_audio)
            }
            TrackKind::Subtitle => false,
        }
    }

    pub fn clip(&self, clip_id: &str) -> Option<&Clip> {
        self.clips.iter().find(|clip| clip.id == clip_id)
    }

    pub fn visual_item(&self, item_id: &str) -> Option<&VisualItem> {
        self.visual_items.iter().find(|item| item.id == item_id)
    }

    /// Clips are kept in start order, which is what lets the ripple and the
    /// overlap check read the track once instead of sorting on every question.
    pub fn sort(&mut self) {
        self.clips.sort_by_key(|clip| clip.start);
    }

    /// The first position at or after `wanted` where a clip of `duration`
    /// frames fits without overlapping. Clips never overlap on a track: two
    /// pictures in the same place at the same time is a question the timeline
    /// cannot answer, and pushing right is the answer every editor gives. See
    /// `adr/2026-08-clips-do-not-overlap.md`.
    pub fn free_start(&self, wanted: i64, duration: i64, ignore: Option<&str>) -> i64 {
        let mut start = wanted.max(0);
        let mut moved = true;
        while moved {
            moved = false;
            for other in &self.clips {
                if Some(other.id.as_str()) == ignore {
                    continue;
                }
                if start < other.end_frame() && other.start < start + duration {
                    start = other.end_frame();
                    moved = true;
                }
            }
        }
        start
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
    #[serde(default)]
    pub link_group: Option<String>,
    #[serde(default)]
    pub lut_path: Option<String>,
    /// Where the clip sits on the timeline, in frames of the project rate.
    pub start: i64,
    /// The span taken out of the source, in frames too. `out` is exclusive.
    #[serde(rename = "in")]
    pub in_point: i64,
    #[serde(rename = "out")]
    pub out_point: i64,
    #[serde(default = "one")]
    pub volume: f32,
    #[serde(default = "one")]
    pub opacity: f32,
    #[serde(default = "one")]
    pub speed: f32,
    #[serde(default = "true_value")]
    pub preserve_pitch: bool,
    #[serde(default)]
    pub fade_in: i64,
    #[serde(default)]
    pub fade_out: i64,
    #[serde(default)]
    pub volume_keyframes: KeyframeTrack,
    #[serde(default)]
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionKind {
    #[default]
    Dissolve,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub id: String,
    pub track_id: String,
    pub from_clip_id: String,
    pub to_clip_id: String,
    pub duration: i64,
    #[serde(default)]
    pub kind: TransitionKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub id: String,
    pub frame: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_marker_color")]
    pub color: String,
}

fn default_marker_color() -> String {
    "#e6a700".into()
}

impl Clip {
    pub fn source_duration_frames(&self) -> i64 {
        (self.out_point - self.in_point).max(0)
    }

    pub fn duration_frames(&self) -> i64 {
        if !self.speed.is_finite() || self.speed <= 0.0 {
            return self.source_duration_frames();
        }
        ((self.source_duration_frames() as f64 / self.speed as f64).round() as i64).max(1)
    }

    pub fn end_frame(&self) -> i64 {
        self.start + self.duration_frames()
    }

    /// The same numbers as times, for the places that have to hand seconds to
    /// ffmpeg.
    pub fn start_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.start, rate)
    }

    pub fn in_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.in_point, rate)
    }

    pub fn duration(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.duration_frames(), rate)
    }

    pub fn end_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.end_frame(), rate)
    }

    pub fn source_frame_at(&self, frame: i64) -> i64 {
        let offset = (frame - self.start).max(0) as f64 * self.speed.max(0.0001) as f64;
        (self.in_point + offset.floor() as i64).min(self.out_point.saturating_sub(1))
    }

    pub fn volume_at(&self, frame: i64) -> f32 {
        let mut volume = self
            .volume_keyframes
            .value_at(frame, self.volume)
            .clamp(0.0, 1.0);
        let offset = frame.saturating_sub(self.start);
        if self.fade_in > 0 {
            volume *= (offset as f32 / self.fade_in as f32).clamp(0.0, 1.0);
        }
        let remaining = self.end_frame().saturating_sub(frame + 1);
        if self.fade_out > 0 {
            volume *= (remaining as f32 / self.fade_out as f32).clamp(0.0, 1.0);
        }
        volume
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    value.is_finite().then_some(value).unwrap_or(fallback)
}

mod visual;
pub use visual::*;
mod project;

#[cfg(test)]
mod tests;
