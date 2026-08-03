//! The project as the page saves it, and the ffmpeg command that turns it into
//! a file.
//!
//! The page owns the editing model (src/timeline.js) because the timeline has
//! to answer a drag on the next frame. This crate is the other half: the same
//! shape read back through serde, so the render and the project file agree with
//! the editor without either side reimplementing the other's arithmetic.

pub mod accel;
pub mod ffmpeg;
pub mod layout;
pub mod probe;
pub mod tools;
pub mod workspace;

use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default)]
    pub settings: ProjectSettings,
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        ProjectSettings {
            width: 1920,
            height: 1080,
            fps: 30,
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
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub has_audio: bool,
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
    /// Where the clip sits on the timeline.
    pub start_ms: u64,
    /// The span taken out of the source. `out_ms` is exclusive.
    pub in_ms: u64,
    pub out_ms: u64,
    #[serde(default = "one")]
    pub volume: f32,
    #[serde(default = "one")]
    pub opacity: f32,
}

impl Clip {
    pub fn duration_ms(&self) -> u64 {
        self.out_ms.saturating_sub(self.in_ms)
    }

    pub fn end_ms(&self) -> u64 {
        self.start_ms + self.duration_ms()
    }
}

impl Project {
    pub fn asset(&self, id: &str) -> Option<&Asset> {
        self.assets.iter().find(|asset| asset.id == id)
    }

    /// How long the rendered file is. Tracks that contribute nothing do not
    /// extend it, so hiding the one long clip at the end actually shortens the
    /// output instead of leaving black.
    pub fn duration_ms(&self) -> u64 {
        self.tracks
            .iter()
            .filter(|track| track.contributes())
            .flat_map(|track| track.clips.iter())
            .filter(|clip| clip.duration_ms() > 0)
            .map(|clip| clip.end_ms())
            .max()
            .unwrap_or(0)
    }
}
