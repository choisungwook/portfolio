//! Every edit, as a command that knows how to undo itself.
//!
//! Nothing mutates a [`Project`] except by going through here, which is what
//! makes undo possible at all: applying a command hands back the command that
//! puts the project back, and the history is a stack of those pairs.
//!
//! The alternative was to push a copy of the whole project onto a stack before
//! every edit. That is much less code and it is wrong at the size this app is
//! for: a copy per keystroke of an hour long timeline costs the whole project
//! each time, while an inverse costs what the edit touched. Trimming one clip
//! stores one clip either way; the difference is everything else.
//!
//! ## Two kinds of command
//!
//! The ones a user recognises — move, trim, split, ripple delete — and a
//! handful of primitives that exist to be inverses: [`Command::RestoreClips`]
//! and its neighbours put a named thing back exactly as it was. Every inverse
//! is built out of those, so an inverse is always a command and the history
//! never has to hold a second kind of thing.
//!
//! ## Transactions
//!
//! [`Command::Transaction`] applies several commands as one undo step, and
//! either all of them happen or none do. When one fails the inverses collected
//! so far are applied in reverse, which is a rollback out of the same machinery
//! the undo stack uses rather than a second implementation of it. A half
//! applied edit is the state nobody can reason about: the user cannot tell how
//! many times to press undo, and neither can the app.

use crate::{
    min_clip_frames, Asset, BlendMode, Clip, Easing, Keyframe, Marker, Project, ProjectSettings,
    Rate, TextStyle, Track, TrackKind, Transition, TransitionKind, VisualContent, VisualItem,
    VisualProperty, VisualTransform,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Which end of a clip a trim is dragging.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Start,
    End,
}

/// A clip and the track it belongs on: what an inverse needs to put one back,
/// including back onto the track it was dragged off.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipAt {
    pub track_id: String,
    pub clip: Clip,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualItemAt {
    pub track_id: String,
    pub item: VisualItem,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerAt {
    pub index: usize,
    pub marker: Marker,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionAt {
    pub index: usize,
    pub transition: Transition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameRange {
    pub start: i64,
    pub end: i64,
}

/// An asset and where it sat in the library, so undoing an import does not
/// quietly reorder the list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetAt {
    pub index: usize,
    pub asset: Asset,
}

/// A track and where it sat, for the same reason.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAt {
    pub index: usize,
    pub track: Track,
}

/// `op` rather than `kind`, because `kind` is already a field on a track and on
/// an asset and an internally tagged enum may not collide with its own fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Command {
    // --- what a user does --------------------------------------------------
    /// Import. An asset already in the library is updated rather than added
    /// twice, because an asset's identity is its path.
    #[serde(rename_all = "camelCase")]
    AddAssets {
        assets: Vec<Asset>,
    },
    /// Removing an asset takes its clips with it, or the render fails on a clip
    /// pointing at nothing.
    #[serde(rename_all = "camelCase")]
    RemoveAsset {
        asset_id: String,
    },
    #[serde(rename_all = "camelCase")]
    AddTrack {
        track_kind: TrackKind,
        /// Filled in when the command is applied, so redo puts back a track
        /// with the id the clips that were on it still name.
        #[serde(default)]
        id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    RemoveTrack {
        track_id: String,
    },
    #[serde(rename_all = "camelCase")]
    SetTrackFlags {
        track_id: String,
        #[serde(default)]
        muted: Option<bool>,
        #[serde(default)]
        hidden: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    SetSubtitleStyle {
        track_id: String,
        style: TextStyle,
    },
    /// Drop an asset onto a track. `start` is where it was asked for; where it
    /// lands is that or the first free frame after it.
    #[serde(rename_all = "camelCase")]
    AddClip {
        track_id: String,
        asset_id: String,
        start: i64,
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        link_group: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    InsertSource {
        asset_id: String,
        #[serde(default)]
        video_track_id: Option<String>,
        #[serde(default)]
        audio_track_id: Option<String>,
        start: i64,
        in_point: i64,
        out_point: i64,
        #[serde(default)]
        ripple_all_tracks: bool,
    },
    #[serde(rename_all = "camelCase")]
    OverwriteSource {
        asset_id: String,
        #[serde(default)]
        video_track_id: Option<String>,
        #[serde(default)]
        audio_track_id: Option<String>,
        start: i64,
        in_point: i64,
        out_point: i64,
    },
    #[serde(rename_all = "camelCase")]
    AppendSource {
        asset_id: String,
        #[serde(default)]
        video_track_id: Option<String>,
        #[serde(default)]
        audio_track_id: Option<String>,
        in_point: i64,
        out_point: i64,
    },
    #[serde(rename_all = "camelCase")]
    MoveClip {
        clip_id: String,
        track_id: String,
        start: i64,
    },
    /// Drag a clip edge. The start edge moves the in point with it, so the
    /// frame under the cursor is the frame that stays.
    #[serde(rename_all = "camelCase")]
    TrimClip {
        clip_id: String,
        edge: Edge,
        frame: i64,
    },
    /// Cut at the playhead. With a clip named only that clip is cut; with none
    /// every clip the playhead crosses is.
    #[serde(rename_all = "camelCase")]
    SplitAt {
        frame: i64,
        #[serde(default)]
        clip_id: Option<String>,
        /// The ids the right hand halves were given, filled in on apply so redo
        /// produces the same clips rather than new ones.
        #[serde(default)]
        ids: Vec<String>,
        #[serde(default)]
        link_groups: Vec<Option<String>>,
    },
    #[serde(rename_all = "camelCase")]
    RemoveClip {
        clip_id: String,
    },
    #[serde(rename_all = "camelCase")]
    AddTransition {
        from_clip_id: String,
        to_clip_id: String,
        duration: i64,
        #[serde(default)]
        id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SetTransitionDuration {
        transition_id: String,
        duration: i64,
    },
    #[serde(rename_all = "camelCase")]
    RemoveTransition {
        transition_id: String,
    },
    #[serde(rename_all = "camelCase")]
    LinkClips {
        clip_ids: Vec<String>,
        #[serde(default)]
        link_group: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    UnlinkClips {
        clip_id: String,
    },
    /// Delete and close the gap: everything after it on the same track moves
    /// left by its length. Destructive, and only reasonable now that there is
    /// an undo to take it back.
    #[serde(rename_all = "camelCase")]
    RippleDelete {
        clip_id: String,
    },
    /// Close the empty space between two clips on one track. The two edges are
    /// named rather than inferred again on redo, because after closing the gap
    /// the frame originally clicked can be inside a clip.
    #[serde(rename_all = "camelCase")]
    RippleDeleteGap {
        track_id: String,
        start: i64,
        end: i64,
    },
    /// Remove several timeline ranges and close every gap across all tracks.
    /// The ranges use the timeline state before this command starts.
    #[serde(rename_all = "camelCase")]
    RemoveRanges {
        ranges: Vec<FrameRange>,
    },
    #[serde(rename_all = "camelCase")]
    SetClipGain {
        clip_id: String,
        #[serde(default)]
        volume: Option<f32>,
        #[serde(default)]
        opacity: Option<f32>,
    },
    /// Noise reduction strength for one clip's sound, 0 to turn it off.
    #[serde(rename_all = "camelCase")]
    SetClipDenoise { clip_id: String, strength: f32 },
    #[serde(rename_all = "camelCase")]
    SetClipLut {
        clip_id: String,
        lut_path: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SetClipPlayback {
        clip_id: String,
        #[serde(default)]
        speed: Option<f32>,
        #[serde(default)]
        preserve_pitch: Option<bool>,
        #[serde(default)]
        fade_in: Option<i64>,
        #[serde(default)]
        fade_out: Option<i64>,
    },
    #[serde(rename_all = "camelCase")]
    SetClipVolumeKeyframe {
        clip_id: String,
        frame: i64,
        value: f32,
        #[serde(default)]
        easing: Easing,
    },
    #[serde(rename_all = "camelCase")]
    RemoveClipVolumeKeyframe {
        clip_id: String,
        frame: i64,
    },
    #[serde(rename_all = "camelCase")]
    SetLayerBlendMode {
        layer_id: String,
        blend_mode: BlendMode,
    },
    #[serde(rename_all = "camelCase")]
    AddVisualItem {
        track_id: String,
        content: VisualContent,
        start: i64,
        duration: i64,
        transform: VisualTransform,
        z_index: i32,
        #[serde(default)]
        id: Option<String>,
    },
    /// Add text or a shape above the picture. A clip-free top video track is
    /// reused; otherwise a new top track and the item are one undo step. At
    /// the track limit the existing top video track is the fallback.
    #[serde(rename_all = "camelCase")]
    AddOverlayVisualItem {
        content: VisualContent,
        start: i64,
        duration: i64,
        transform: VisualTransform,
        z_index: i32,
        #[serde(default)]
        id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SetVisualTransform {
        item_id: String,
        transform: VisualTransform,
    },
    #[serde(rename_all = "camelCase")]
    SetVisualKeyframe {
        item_id: String,
        property: VisualProperty,
        frame: i64,
        value: f32,
        #[serde(default)]
        easing: Easing,
    },
    #[serde(rename_all = "camelCase")]
    RemoveVisualKeyframe {
        item_id: String,
        property: VisualProperty,
        frame: i64,
    },
    #[serde(rename_all = "camelCase")]
    SetVisualTiming {
        item_id: String,
        start: i64,
        duration: i64,
    },
    #[serde(rename_all = "camelCase")]
    SetVisualZIndex {
        item_id: String,
        z_index: i32,
    },
    #[serde(rename_all = "camelCase")]
    SetVisualContent {
        item_id: String,
        content: VisualContent,
    },
    #[serde(rename_all = "camelCase")]
    RemoveVisualItem {
        item_id: String,
    },
    #[serde(rename_all = "camelCase")]
    AddMarker {
        frame: i64,
        #[serde(default)]
        name: String,
        #[serde(default)]
        color: String,
        #[serde(default)]
        id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SetMarker {
        marker_id: String,
        #[serde(default)]
        frame: Option<i64>,
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        color: Option<String>,
    },
    RemoveMarker {
        marker_id: String,
    },
    /// Resolution and timebase. Changing the rate carries the edit with it, so
    /// a cut stays where it was in time rather than where it was in frames.
    #[serde(rename_all = "camelCase")]
    SetSettings {
        settings: ProjectSettings,
    },

    // --- primitives, which exist to be inverses ----------------------------
    /// Put these clips back exactly, on the tracks named. A clip with the same
    /// id anywhere else is taken out first, so this also undoes a move between
    /// tracks.
    #[serde(rename_all = "camelCase")]
    RestoreClips {
        entries: Vec<ClipAt>,
    },
    #[serde(rename_all = "camelCase")]
    DropClips {
        clip_ids: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    RestoreAssets {
        entries: Vec<AssetAt>,
    },
    #[serde(rename_all = "camelCase")]
    DropAssets {
        asset_ids: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    RestoreTracks {
        entries: Vec<TrackAt>,
    },
    #[serde(rename_all = "camelCase")]
    DropTracks {
        track_ids: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    RestoreVisualItems {
        entries: Vec<VisualItemAt>,
    },
    #[serde(rename_all = "camelCase")]
    DropVisualItems {
        item_ids: Vec<String>,
    },
    RestoreMarkers {
        entries: Vec<MarkerAt>,
    },
    DropMarkers {
        marker_ids: Vec<String>,
    },
    RestoreTransitions {
        entries: Vec<TransitionAt>,
    },
    DropTransitions {
        transition_ids: Vec<String>,
    },
    RestoreTimeline {
        tracks: Vec<Track>,
        transitions: Vec<Transition>,
        markers: Vec<Marker>,
    },

    /// One undo step made of several commands, all or nothing.
    #[serde(rename_all = "camelCase")]
    Transaction {
        commands: Vec<Command>,
    },
}

/// What applying a command produced: the command as it actually happened, and
/// the one that undoes it.
///
/// `resolved` matters for redo. A command can arrive with holes in it — an
/// `AddClip` with no id, a `SplitAt` that does not know yet how many clips it
/// will make — and redoing the version the user sent would mint new ids each
/// time, so the selection and every later command in the history would be
/// talking about clips that no longer exist. The filled in version is what the
/// history keeps.
pub struct Applied {
    pub resolved: Command,
    pub inverse: Command,
}

/// The counter that names new tracks and clips. Ids only have to be unique
/// within a project and short enough to read in a project file.
#[derive(Debug, Default)]
pub struct Ids {
    next: u64,
}

impl Ids {
    pub fn seeded(from: u64) -> Ids {
        Ids { next: from }
    }

    /// Pushed past whatever is already in a project that was just opened, so
    /// the first clip added after an open cannot collide with one already
    /// there.
    pub fn observe(&mut self, id: &str) {
        let digits: String = id.chars().skip_while(|c| !c.is_ascii_digit()).collect();
        if !digits.is_empty()
            && id
                .chars()
                .take_while(|c| !c.is_ascii_digit())
                .all(char::is_alphabetic)
        {
            if let Ok(value) = digits.parse::<u64>() {
                self.next = self.next.max(value);
            }
        }
    }

    pub fn make(&mut self, prefix: char) -> String {
        self.next += 1;
        format!("{prefix}{}", self.next)
    }
}

fn nothing() -> Command {
    Command::Transaction {
        commands: Vec::new(),
    }
}

impl Command {
    /// Whether this command changed nothing, which is how a split that crosses
    /// no clip stays out of the history instead of becoming an undo step that
    /// does not do anything.
    pub fn is_nothing(&self) -> bool {
        match self {
            Command::Transaction { commands } => commands.iter().all(Command::is_nothing),
            _ => false,
        }
    }

    /// What the Edit menu calls this, for "Undo Move clip".
    pub fn label(&self) -> &'static str {
        match self {
            Command::AddAssets { .. } => "Import",
            Command::RemoveAsset { .. } => "Remove asset",
            Command::AddTrack { .. } => "Add track",
            Command::RemoveTrack { .. } | Command::DropTracks { .. } => "Remove track",
            Command::SetTrackFlags { .. } => "Track settings",
            Command::SetSubtitleStyle { .. } => "Subtitle style",
            Command::AddClip { .. } => "Add clip",
            Command::InsertSource { .. } => "Insert source",
            Command::OverwriteSource { .. } => "Overwrite source",
            Command::AppendSource { .. } => "Append source",
            Command::MoveClip { .. } => "Move clip",
            Command::TrimClip { .. } => "Trim clip",
            Command::SplitAt { .. } => "Split",
            Command::RemoveClip { .. } | Command::DropClips { .. } => "Delete clip",
            Command::AddTransition { .. } => "Add transition",
            Command::SetTransitionDuration { .. } => "Edit transition",
            Command::RemoveTransition { .. } | Command::DropTransitions { .. } => {
                "Delete transition"
            }
            Command::LinkClips { .. } => "Link clips",
            Command::UnlinkClips { .. } => "Unlink clips",
            Command::RippleDelete { .. } => "Ripple delete",
            Command::RippleDeleteGap { .. } => "Ripple delete gap",
            Command::RemoveRanges { .. } => "Remove silence",
            Command::SetClipGain { .. } => "Clip levels",
            Command::SetClipDenoise { .. } => "Noise reduction",
            Command::SetClipLut { .. } => "Clip LUT",
            Command::SetClipPlayback { .. } => "Clip playback",
            Command::SetClipVolumeKeyframe { .. } | Command::RemoveClipVolumeKeyframe { .. } => {
                "Volume keyframe"
            }
            Command::SetLayerBlendMode { .. } => "Blend mode",
            Command::AddVisualItem { .. } => "Add visual item",
            Command::AddOverlayVisualItem { .. } => "Add visual item",
            Command::SetVisualTransform { .. } => "Transform visual item",
            Command::SetVisualKeyframe { .. } | Command::RemoveVisualKeyframe { .. } => {
                "Visual keyframe"
            }
            Command::SetVisualTiming { .. } => "Time visual item",
            Command::SetVisualZIndex { .. } => "Reorder visual item",
            Command::SetVisualContent { .. } => "Edit visual item",
            Command::RemoveVisualItem { .. } | Command::DropVisualItems { .. } => {
                "Delete visual item"
            }
            Command::AddMarker { .. } => "Add marker",
            Command::SetMarker { .. } => "Edit marker",
            Command::RemoveMarker { .. } | Command::DropMarkers { .. } => "Delete marker",
            Command::SetSettings { .. } => "Project settings",
            Command::RestoreClips { .. } => "Restore clips",
            Command::RestoreAssets { .. } | Command::DropAssets { .. } => "Assets",
            Command::RestoreTracks { .. } => "Restore track",
            Command::RestoreVisualItems { .. } => "Restore visual items",
            Command::RestoreMarkers { .. } => "Restore markers",
            Command::RestoreTransitions { .. } => "Restore transitions",
            Command::RestoreTimeline { .. } => "Restore timeline",
            Command::Transaction { commands } => commands
                .iter()
                .find(|command| !command.is_nothing())
                .map(Command::label)
                .unwrap_or("Edit"),
        }
    }

    /// Apply, and hand back both the filled in command and its inverse.
    ///
    /// Nothing here checks the invariants. The document does that once, after
    /// the whole command has landed, because the middle of a transaction is
    /// allowed to look wrong: moving two clips past each other passes through a
    /// state where they overlap.
    pub(crate) fn perform(self, project: &mut Project, ids: &mut Ids) -> Result<Applied, String> {
        match self {
            Command::AddAssets { assets } => Ok(add_assets(project, assets)),
            Command::RemoveAsset { asset_id } => remove_asset(project, asset_id),
            Command::AddTrack { track_kind, id } => add_track(project, ids, track_kind, id),
            Command::RemoveTrack { track_id } => remove_track(project, track_id),
            Command::SetTrackFlags {
                track_id,
                muted,
                hidden,
            } => set_track_flags(project, track_id, muted, hidden),
            Command::SetSubtitleStyle { track_id, style } => {
                set_subtitle_style(project, track_id, style)
            }
            Command::AddClip {
                track_id,
                asset_id,
                start,
                id,
                link_group,
            } => add_clip(project, ids, track_id, asset_id, start, id, link_group),
            Command::InsertSource {
                asset_id,
                video_track_id,
                audio_track_id,
                start,
                in_point,
                out_point,
                ripple_all_tracks,
            } => insert_source(
                project,
                ids,
                asset_id,
                video_track_id,
                audio_track_id,
                start,
                in_point,
                out_point,
                ripple_all_tracks,
            ),
            Command::OverwriteSource {
                asset_id,
                video_track_id,
                audio_track_id,
                start,
                in_point,
                out_point,
            } => overwrite_source(
                project,
                ids,
                asset_id,
                video_track_id,
                audio_track_id,
                start,
                in_point,
                out_point,
            ),
            Command::AppendSource {
                asset_id,
                video_track_id,
                audio_track_id,
                in_point,
                out_point,
            } => append_source(
                project,
                ids,
                asset_id,
                video_track_id,
                audio_track_id,
                in_point,
                out_point,
            ),
            Command::MoveClip {
                clip_id,
                track_id,
                start,
            } => move_clip(project, clip_id, track_id, start),
            Command::TrimClip {
                clip_id,
                edge,
                frame,
            } => trim_clip(project, clip_id, edge, frame),
            Command::SplitAt {
                frame,
                clip_id,
                ids: given,
                link_groups,
            } => Ok(split_at(project, ids, frame, clip_id, given, link_groups)),
            Command::RemoveClip { clip_id } => remove_clip(project, clip_id),
            Command::AddTransition {
                from_clip_id,
                to_clip_id,
                duration,
                id,
            } => add_transition(project, ids, from_clip_id, to_clip_id, duration, id),
            Command::SetTransitionDuration {
                transition_id,
                duration,
            } => set_transition_duration(project, transition_id, duration),
            Command::RemoveTransition { transition_id } => {
                remove_transition(project, transition_id)
            }
            Command::LinkClips {
                clip_ids,
                link_group,
            } => link_clips(project, ids, clip_ids, link_group),
            Command::UnlinkClips { clip_id } => unlink_clips(project, clip_id),
            Command::RippleDelete { clip_id } => ripple_delete(project, clip_id),
            Command::RippleDeleteGap {
                track_id,
                start,
                end,
            } => ripple_delete_gap(project, track_id, start, end),
            Command::RemoveRanges { ranges } => remove_ranges(project, ids, ranges),
            Command::SetClipGain {
                clip_id,
                volume,
                opacity,
            } => set_clip_gain(project, clip_id, volume, opacity),
            Command::SetClipDenoise { clip_id, strength } => {
                set_clip_denoise(project, clip_id, strength)
            }
            Command::SetClipLut { clip_id, lut_path } => set_clip_lut(project, clip_id, lut_path),
            Command::SetClipPlayback {
                clip_id,
                speed,
                preserve_pitch,
                fade_in,
                fade_out,
            } => set_clip_playback(project, clip_id, speed, preserve_pitch, fade_in, fade_out),
            Command::SetClipVolumeKeyframe {
                clip_id,
                frame,
                value,
                easing,
            } => set_clip_volume_keyframe(project, clip_id, frame, value, easing),
            Command::RemoveClipVolumeKeyframe { clip_id, frame } => {
                remove_clip_volume_keyframe(project, clip_id, frame)
            }
            Command::SetLayerBlendMode {
                layer_id,
                blend_mode,
            } => set_layer_blend_mode(project, layer_id, blend_mode),
            Command::AddVisualItem {
                track_id,
                content,
                start,
                duration,
                transform,
                z_index,
                id,
            } => add_visual_item(
                project, ids, track_id, content, start, duration, transform, z_index, id,
            ),
            Command::AddOverlayVisualItem {
                content,
                start,
                duration,
                transform,
                z_index,
                id,
            } => add_overlay_visual_item(
                project, ids, content, start, duration, transform, z_index, id,
            ),
            Command::SetVisualTransform { item_id, transform } => {
                set_visual_transform(project, item_id, transform)
            }
            Command::SetVisualKeyframe {
                item_id,
                property,
                frame,
                value,
                easing,
            } => set_visual_keyframe(project, item_id, property, frame, value, easing),
            Command::RemoveVisualKeyframe {
                item_id,
                property,
                frame,
            } => remove_visual_keyframe(project, item_id, property, frame),
            Command::SetVisualTiming {
                item_id,
                start,
                duration,
            } => set_visual_timing(project, item_id, start, duration),
            Command::SetVisualZIndex { item_id, z_index } => {
                set_visual_z_index(project, item_id, z_index)
            }
            Command::SetVisualContent { item_id, content } => {
                set_visual_content(project, item_id, content)
            }
            Command::RemoveVisualItem { item_id } => remove_visual_item(project, item_id),
            Command::AddMarker {
                frame,
                name,
                color,
                id,
            } => add_marker(project, ids, frame, name, color, id),
            Command::SetMarker {
                marker_id,
                frame,
                name,
                color,
            } => set_marker(project, marker_id, frame, name, color),
            Command::RemoveMarker { marker_id } => remove_marker(project, marker_id),
            Command::SetSettings { settings } => Ok(set_settings(project, settings)),
            Command::RestoreClips { entries } => Ok(restore_clips(project, entries)),
            Command::DropClips { clip_ids } => Ok(drop_clips(project, clip_ids)),
            Command::RestoreAssets { entries } => Ok(restore_assets(project, entries)),
            Command::DropAssets { asset_ids } => Ok(drop_assets(project, asset_ids)),
            Command::RestoreTracks { entries } => Ok(restore_tracks(project, entries)),
            Command::DropTracks { track_ids } => Ok(drop_tracks(project, track_ids)),
            Command::RestoreVisualItems { entries } => Ok(restore_visual_items(project, entries)),
            Command::DropVisualItems { item_ids } => Ok(drop_visual_items(project, item_ids)),
            Command::RestoreMarkers { entries } => Ok(restore_markers(project, entries)),
            Command::DropMarkers { marker_ids } => Ok(drop_markers(project, marker_ids)),
            Command::RestoreTransitions { entries } => Ok(restore_transitions(project, entries)),
            Command::DropTransitions { transition_ids } => {
                Ok(drop_transitions(project, transition_ids))
            }
            Command::RestoreTimeline {
                tracks,
                transitions,
                markers,
            } => Ok(restore_timeline(project, tracks, transitions, markers)),
            Command::Transaction { commands } => transaction(project, ids, commands),
        }
    }
}

/// Apply in order, and on the first failure put back everything that has
/// already happened. The rollback is the inverses in reverse, which is the undo
/// stack's own machinery rather than a second copy of it.
fn transaction(
    project: &mut Project,
    ids: &mut Ids,
    commands: Vec<Command>,
) -> Result<Applied, String> {
    let mut resolved = Vec::with_capacity(commands.len());
    let mut inverses = Vec::with_capacity(commands.len());
    for command in commands {
        match command.perform(project, ids) {
            Ok(applied) => {
                resolved.push(applied.resolved);
                inverses.push(applied.inverse);
            }
            Err(error) => {
                for inverse in inverses.into_iter().rev() {
                    // A restore primitive cannot fail, and these are all
                    // restore primitives.
                    let _ = inverse.perform(project, ids);
                }
                return Err(error);
            }
        }
    }
    inverses.reverse();
    Ok(Applied {
        resolved: Command::Transaction { commands: resolved },
        inverse: Command::Transaction { commands: inverses },
    })
}

mod assets;
use assets::*;
mod source;
use source::*;
mod clips;
use clips::*;
mod properties;
use properties::*;
mod restore;
use restore::*;
