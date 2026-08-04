//! The project as the page saves it, and the ffmpeg command that turns it into
//! a file.
//!
//! The page owns the editing model (src/timeline.js) because the timeline has
//! to answer a drag on the next frame. This crate is the other half: the same
//! shape read back through serde, so the render and the project file agree with
//! the editor without either side reimplementing the other's arithmetic.
//!
//! Every time in here is a frame count on `settings.rate`. Nothing divides to
//! get one and nothing rounds to store one; the makevideo-time crate says why
//! that matters.

pub mod accel;
pub mod ffmpeg;
pub mod layout;
pub mod migrate;
pub mod probe;
pub mod tools;
pub mod workspace;

pub use makevideo_time::{RationalTime, Rate};

use serde::{Deserialize, Serialize};

/// What `version` a project file written today holds. Version 1 measured
/// everything in whole milliseconds; `migrate` turns one of those into this on
/// the way in, so a project saved before this existed still opens.
pub const FORMAT_VERSION: u32 = 2;

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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "migrate::WireProject")]
pub struct Project {
    /// The storage format, not the app version.
    pub version: u32,
    pub settings: ProjectSettings,
    pub assets: Vec<Asset>,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub kind: TrackKind,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub clips: Vec<Clip>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
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

impl Project {
    pub fn asset(&self, id: &str) -> Option<&Asset> {
        self.assets.iter().find(|asset| asset.id == id)
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
            .flat_map(|track| track.clips.iter())
            .filter(|clip| clip.duration_frames() > 0)
            .map(|clip| clip.end_frame())
            .max()
            .unwrap_or(0)
    }

    pub fn duration(&self) -> RationalTime {
        RationalTime::new(self.duration_frames(), self.rate())
    }
}
