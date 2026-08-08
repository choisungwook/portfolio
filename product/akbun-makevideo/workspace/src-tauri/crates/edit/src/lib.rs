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

pub mod command;
pub mod document;
pub mod migrate;

pub use command::{ClipAt, Command, Edge, VisualItemAt};
pub use document::{Document, DocumentState};
pub use makevideo_time::{Rate, RationalTime};

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// What `version` a project file written today holds. Version 1 measured
/// everything in whole milliseconds; `migrate` turns one of those into this on
/// the way in, so a project saved before this existed still opens.
pub const FORMAT_VERSION: u32 = 2;

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
}

impl TrackKind {
    /// V1, V2, A1. The number is what the timeline header shows, so removing a
    /// track has to leave the remaining names in step with their positions —
    /// which is why only the last track of a kind can go.
    pub fn name_for(self, index: usize) -> String {
        let letter = match self {
            TrackKind::Video => 'V',
            TrackKind::Audio => 'A',
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

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTransform {
    /// Project pixels, independent of the monitor's display scale.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    /// Clockwise degrees around the item's centre.
    pub rotation: f32,
    #[serde(default = "one")]
    pub opacity: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum VisualContent {
    Text { text: String },
    Shape,
    Image { asset_id: String },
    VideoOverlay { asset_id: String },
}

impl VisualContent {
    pub fn asset_id(&self) -> Option<&str> {
        match self {
            VisualContent::Image { asset_id } | VisualContent::VideoOverlay { asset_id } => {
                Some(asset_id)
            }
            VisualContent::Text { .. } | VisualContent::Shape => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualItem {
    pub id: String,
    /// Frame indexes on the project rate, like clip times.
    pub start: i64,
    pub duration: i64,
    pub transform: VisualTransform,
    /// Higher values draw later within the track. Track array order remains
    /// the primary layer order.
    pub z_index: i32,
    pub content: VisualContent,
}

impl VisualItem {
    pub fn end_frame(&self) -> i64 {
        self.start.saturating_add(self.duration.max(0))
    }

    pub fn contains_frame(&self, frame: i64) -> bool {
        self.start <= frame && frame < self.end_frame()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
    #[serde(default)]
    pub link_group: Option<String>,
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
}

impl Clip {
    pub fn duration_frames(&self) -> i64 {
        (self.out_point - self.in_point).max(0)
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
}

/// Where a clip is, which is the pair the history stores to put one back.
impl Project {
    pub fn new(settings: ProjectSettings) -> Project {
        Project {
            version: FORMAT_VERSION,
            settings,
            assets: Vec::new(),
            tracks: vec![
                Track {
                    id: "t1".into(),
                    kind: TrackKind::Video,
                    name: "V1".into(),
                    clips: Vec::new(),
                    visual_items: Vec::new(),
                    muted: false,
                    hidden: false,
                },
                Track {
                    id: "t2".into(),
                    kind: TrackKind::Audio,
                    name: "A1".into(),
                    clips: Vec::new(),
                    visual_items: Vec::new(),
                    muted: false,
                    hidden: false,
                },
            ],
        }
    }

    pub fn asset(&self, id: &str) -> Option<&Asset> {
        self.assets.iter().find(|asset| asset.id == id)
    }

    pub fn asset_index(&self, id: &str) -> Option<usize> {
        self.assets.iter().position(|asset| asset.id == id)
    }

    pub fn track(&self, id: &str) -> Option<&Track> {
        self.tracks.iter().find(|track| track.id == id)
    }

    pub fn track_mut(&mut self, id: &str) -> Option<&mut Track> {
        self.tracks.iter_mut().find(|track| track.id == id)
    }

    pub fn track_index(&self, id: &str) -> Option<usize> {
        self.tracks.iter().position(|track| track.id == id)
    }

    /// Which track a clip is on, and where in that track's list it sits.
    pub fn locate(&self, clip_id: &str) -> Option<(usize, usize)> {
        for (track, entry) in self.tracks.iter().enumerate() {
            if let Some(clip) = entry.clips.iter().position(|clip| clip.id == clip_id) {
                return Some((track, clip));
            }
        }
        None
    }

    pub fn clip(&self, clip_id: &str) -> Option<&Clip> {
        let (track, clip) = self.locate(clip_id)?;
        Some(&self.tracks[track].clips[clip])
    }

    pub fn locate_visual_item(&self, item_id: &str) -> Option<(usize, usize)> {
        for (track, entry) in self.tracks.iter().enumerate() {
            if let Some(item) = entry
                .visual_items
                .iter()
                .position(|item| item.id == item_id)
            {
                return Some((track, item));
            }
        }
        None
    }

    pub fn visual_item(&self, item_id: &str) -> Option<&VisualItem> {
        let (track, item) = self.locate_visual_item(item_id)?;
        Some(&self.tracks[track].visual_items[item])
    }

    pub fn visual_item_placement(&self, item_id: &str) -> Option<VisualItemAt> {
        let (track, item) = self.locate_visual_item(item_id)?;
        Some(VisualItemAt {
            track_id: self.tracks[track].id.clone(),
            item: self.tracks[track].visual_items[item].clone(),
        })
    }

    /// The compositor order at one frame. Track order is primary and z-index
    /// only orders items that belong to the same track.
    pub fn visual_items_at(&self, frame: i64) -> Vec<VisualItemAt> {
        let mut visible = Vec::new();
        for track in &self.tracks {
            if track.kind != TrackKind::Video || track.hidden {
                continue;
            }
            let mut items: Vec<&VisualItem> = track
                .visual_items
                .iter()
                .filter(|item| item.contains_frame(frame))
                .collect();
            items.sort_by(|left, right| {
                left.z_index
                    .cmp(&right.z_index)
                    .then_with(|| left.id.cmp(&right.id))
            });
            visible.extend(items.into_iter().map(|item| VisualItemAt {
                track_id: track.id.clone(),
                item: item.clone(),
            }));
        }
        visible
    }

    pub fn linked_placements(&self, clip_id: &str) -> Vec<ClipAt> {
        let Some(clip) = self.clip(clip_id) else {
            return Vec::new();
        };
        let Some(group) = clip.link_group.as_deref() else {
            return self.placement(clip_id).into_iter().collect();
        };
        self.tracks
            .iter()
            .flat_map(|track| {
                track.clips.iter().filter_map(move |clip| {
                    (clip.link_group.as_deref() == Some(group)).then(|| ClipAt {
                        track_id: track.id.clone(),
                        clip: clip.clone(),
                    })
                })
            })
            .collect()
    }

    /// The track a clip is on, and a clone of the clip: what an inverse needs
    /// to put the thing back exactly where it was.
    pub fn placement(&self, clip_id: &str) -> Option<ClipAt> {
        let (track, clip) = self.locate(clip_id)?;
        Some(ClipAt {
            track_id: self.tracks[track].id.clone(),
            clip: self.tracks[track].clips[clip].clone(),
        })
    }

    pub fn tracks_of(&self, kind: TrackKind) -> impl Iterator<Item = &Track> {
        self.tracks.iter().filter(move |track| track.kind == kind)
    }

    pub fn rate(&self) -> Rate {
        self.settings.rate
    }

    /// How long the rendered file is, in frames. Tracks that contribute nothing
    /// do not extend it, so hiding the one long clip at the end actually
    /// shortens the output instead of leaving black.
    pub fn duration_frames(&self) -> i64 {
        self.tracks
            .iter()
            .filter(|track| track.contributes())
            .flat_map(|track| {
                let clips = track
                    .clips
                    .iter()
                    .filter(|clip| clip.duration_frames() > 0)
                    .map(Clip::end_frame);
                let items = track
                    .visual_items
                    .iter()
                    .filter(|item| item.duration > 0)
                    .map(VisualItem::end_frame);
                clips.chain(items)
            })
            .max()
            .unwrap_or(0)
    }

    pub fn duration(&self) -> RationalTime {
        RationalTime::new(self.duration_frames(), self.rate())
    }

    /// How far into its source a clip may reach, when anything knows.
    fn source_limit(&self, clip: &Clip) -> Option<i64> {
        self.asset(&clip.asset_id)?.source_limit_frames(self.rate())
    }

    /// Everything a clip has to satisfy for the rest of the app to be able to
    /// assume it.
    ///
    /// These are checked after every command rather than trusted, because a
    /// broken one does not show up on the timeline: a zero length clip draws as
    /// nothing and an out point past the end of the file draws as the last
    /// frame, and both turn into an ffmpeg failure or a black stretch halfway
    /// through a render that has already been running for ten minutes. Finding
    /// out at the edit costs a rejected drag; finding out at the render costs
    /// the render.
    pub fn validate(&self) -> Result<(), String> {
        let mut links: HashMap<&str, Vec<(&Track, &Clip)>> = HashMap::new();
        for track in &self.tracks {
            let mut previous_end = i64::MIN;
            for clip in &track.clips {
                let name = &clip.id;
                if clip.start < 0 {
                    return Err(format!("clip {name} would start before the timeline does"));
                }
                if clip.in_point < 0 {
                    return Err(format!("clip {name} would start before its source does"));
                }
                if clip.out_point <= clip.in_point {
                    return Err(format!("clip {name} would have no length"));
                }
                if let Some(limit) = self.source_limit(clip) {
                    if clip.out_point > limit {
                        return Err(format!(
                            "clip {name} would reach past the end of its source"
                        ));
                    }
                }
                if clip.start < previous_end {
                    return Err(format!("clip {name} would overlap the clip before it"));
                }
                if let Some(group) = clip.link_group.as_deref() {
                    links.entry(group).or_default().push((track, clip));
                }
                previous_end = clip.end_frame();
            }
            if track.kind == TrackKind::Audio && !track.visual_items.is_empty() {
                return Err("visual items belong on video tracks".into());
            }
            for item in &track.visual_items {
                let name = &item.id;
                if item.start < 0 {
                    return Err(format!(
                        "visual item {name} would start before the timeline does"
                    ));
                }
                if item.duration <= 0 {
                    return Err(format!("visual item {name} would have no length"));
                }
                let transform = item.transform;
                if ![
                    transform.x,
                    transform.y,
                    transform.width,
                    transform.height,
                    transform.rotation,
                    transform.opacity,
                ]
                .into_iter()
                .all(f32::is_finite)
                {
                    return Err(format!("visual item {name} has a non-finite transform"));
                }
                if transform.width <= 0.0 || transform.height <= 0.0 {
                    return Err(format!("visual item {name} would have no area"));
                }
                if !(0.0..=1.0).contains(&transform.opacity) {
                    return Err(format!(
                        "visual item {name} has opacity outside 0 through 1"
                    ));
                }
            }
        }
        for (group, entries) in links {
            if entries.len() != 2 {
                return Err(format!(
                    "link group {group} must contain one video and one audio clip"
                ));
            }
            let (first_track, first) = entries[0];
            let (second_track, second) = entries[1];
            if first_track.kind == second_track.kind
                || first.asset_id != second.asset_id
                || first.start != second.start
                || first.in_point != second.in_point
                || first.out_point != second.out_point
            {
                return Err(format!("link group {group} is out of sync"));
            }
        }
        Ok(())
    }

    /// Hold a project that is already on disk to the invariants above.
    ///
    /// Opening is not the place to refuse: a file written by an older build, or
    /// one whose media has been re-encoded to a slightly different length since
    /// it was imported, would otherwise become a project nobody can open at
    /// all. So a clip that breaks a rule is pulled back to the nearest state
    /// that keeps it, and one that has nothing left is dropped.
    pub fn repair(&mut self) {
        let limits: Vec<Option<i64>> = self
            .tracks
            .iter()
            .flat_map(|track| track.clips.iter())
            .map(|clip| self.source_limit(clip))
            .collect();
        let mut limit = limits.into_iter();
        for track in &mut self.tracks {
            for clip in &mut track.clips {
                let source = limit.next().flatten();
                clip.start = clip.start.max(0);
                clip.in_point = clip.in_point.max(0);
                if let Some(source) = source {
                    clip.in_point = clip.in_point.min(source - 1);
                    clip.out_point = clip.out_point.min(source);
                }
                clip.out_point = clip.out_point.max(clip.in_point + 1);
            }
            track.sort();
            // Sorted, so one pass right pushes every overlap out of the way in
            // the same direction a drop would.
            let mut end = 0;
            for clip in &mut track.clips {
                clip.start = clip.start.max(end);
                end = clip.end_frame();
            }
            if track.kind == TrackKind::Audio {
                track.visual_items.clear();
            } else {
                for item in &mut track.visual_items {
                    item.start = item.start.max(0);
                    item.duration = item.duration.max(1);
                    item.transform.x = finite_or(item.transform.x, 0.0);
                    item.transform.y = finite_or(item.transform.y, 0.0);
                    item.transform.width = finite_or(item.transform.width, 1.0).max(1.0);
                    item.transform.height = finite_or(item.transform.height, 1.0).max(1.0);
                    item.transform.rotation = finite_or(item.transform.rotation, 0.0);
                    item.transform.opacity = finite_or(item.transform.opacity, 1.0).clamp(0.0, 1.0);
                }
            }
        }
        let mut groups: HashMap<String, Vec<(TrackKind, String, i64, i64, i64)>> = HashMap::new();
        for track in &self.tracks {
            for clip in &track.clips {
                if let Some(group) = &clip.link_group {
                    groups.entry(group.clone()).or_default().push((
                        track.kind,
                        clip.asset_id.clone(),
                        clip.start,
                        clip.in_point,
                        clip.out_point,
                    ));
                }
            }
        }
        let valid: HashSet<String> = groups
            .into_iter()
            .filter_map(|(group, entries)| {
                if entries.len() != 2 {
                    return None;
                }
                let first = &entries[0];
                let second = &entries[1];
                (first.0 != second.0
                    && first.1 == second.1
                    && first.2 == second.2
                    && first.3 == second.3
                    && first.4 == second.4)
                    .then_some(group)
            })
            .collect();
        for track in &mut self.tracks {
            for clip in &mut track.clips {
                if clip
                    .link_group
                    .as_ref()
                    .is_some_and(|group| !valid.contains(group))
                {
                    clip.link_group = None;
                }
            }
        }
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    value.is_finite().then_some(value).unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
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
            start,
            in_point,
            out_point,
            volume: 1.0,
            opacity: 1.0,
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
            z_index,
            content: VisualContent::Shape,
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
}
