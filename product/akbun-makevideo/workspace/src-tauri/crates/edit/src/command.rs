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
    min_clip_frames, Asset, Clip, Marker, Project, ProjectSettings, Rate, Track, TrackKind,
    VisualContent, VisualItem, VisualTransform,
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
    #[serde(rename_all = "camelCase")]
    SetClipGain {
        clip_id: String,
        #[serde(default)]
        volume: Option<f32>,
        #[serde(default)]
        opacity: Option<f32>,
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
    #[serde(rename_all = "camelCase")]
    SetVisualTransform {
        item_id: String,
        transform: VisualTransform,
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
            Command::AddClip { .. } => "Add clip",
            Command::MoveClip { .. } => "Move clip",
            Command::TrimClip { .. } => "Trim clip",
            Command::SplitAt { .. } => "Split",
            Command::RemoveClip { .. } | Command::DropClips { .. } => "Delete clip",
            Command::LinkClips { .. } => "Link clips",
            Command::UnlinkClips { .. } => "Unlink clips",
            Command::RippleDelete { .. } => "Ripple delete",
            Command::RippleDeleteGap { .. } => "Ripple delete gap",
            Command::SetClipGain { .. } => "Clip levels",
            Command::AddVisualItem { .. } => "Add visual item",
            Command::SetVisualTransform { .. } => "Transform visual item",
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
            Command::AddClip {
                track_id,
                asset_id,
                start,
                id,
                link_group,
            } => add_clip(project, ids, track_id, asset_id, start, id, link_group),
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
            Command::SetClipGain {
                clip_id,
                volume,
                opacity,
            } => set_clip_gain(project, clip_id, volume, opacity),
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
            Command::SetVisualTransform { item_id, transform } => {
                set_visual_transform(project, item_id, transform)
            }
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

fn add_assets(project: &mut Project, assets: Vec<Asset>) -> Applied {
    let mut added = Vec::new();
    let mut replaced = Vec::new();
    for asset in &assets {
        match project.asset_index(&asset.id) {
            Some(index) => {
                replaced.push(AssetAt {
                    index,
                    asset: project.assets[index].clone(),
                });
                project.assets[index] = asset.clone();
            }
            None => {
                added.push(asset.id.clone());
                project.assets.push(asset.clone());
            }
        }
    }
    Applied {
        resolved: Command::AddAssets { assets },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropAssets { asset_ids: added },
                Command::RestoreAssets { entries: replaced },
            ],
        },
    }
}

fn remove_asset(project: &mut Project, asset_id: String) -> Result<Applied, String> {
    let index = project
        .asset_index(&asset_id)
        .ok_or("that asset is not in this project")?;
    let asset = project.assets.remove(index);
    let mut orphans = Vec::new();
    let mut orphan_items = Vec::new();
    for track in &mut project.tracks {
        for clip in &track.clips {
            if clip.asset_id == asset_id {
                orphans.push(ClipAt {
                    track_id: track.id.clone(),
                    clip: clip.clone(),
                });
            }
        }
        track.clips.retain(|clip| clip.asset_id != asset_id);
        for item in &track.visual_items {
            if item.content.asset_id() == Some(asset_id.as_str()) {
                orphan_items.push(VisualItemAt {
                    track_id: track.id.clone(),
                    item: item.clone(),
                });
            }
        }
        track
            .visual_items
            .retain(|item| item.content.asset_id() != Some(asset_id.as_str()));
    }
    Ok(Applied {
        resolved: Command::RemoveAsset { asset_id },
        inverse: Command::Transaction {
            commands: vec![
                Command::RestoreAssets {
                    entries: vec![AssetAt { index, asset }],
                },
                Command::RestoreClips { entries: orphans },
                Command::RestoreVisualItems {
                    entries: orphan_items,
                },
            ],
        },
    })
}

fn add_track(
    project: &mut Project,
    ids: &mut Ids,
    kind: TrackKind,
    id: Option<String>,
) -> Result<Applied, String> {
    let existing = project.tracks_of(kind).count();
    if existing >= crate::MAX_TRACKS_PER_KIND {
        return Err(format!(
            "{} tracks of one kind is as many as the timeline holds",
            crate::MAX_TRACKS_PER_KIND
        ));
    }
    let id = id.unwrap_or_else(|| ids.make('t'));
    project.tracks.push(Track {
        id: id.clone(),
        kind,
        name: kind.name_for(existing),
        clips: Vec::new(),
        visual_items: Vec::new(),
        muted: false,
        hidden: false,
    });
    Ok(Applied {
        resolved: Command::AddTrack {
            track_kind: kind,
            id: Some(id.clone()),
        },
        inverse: Command::DropTracks {
            track_ids: vec![id],
        },
    })
}

/// The last track of a kind is the only one that can go, so the remaining names
/// stay in step with their numbers.
fn remove_track(project: &mut Project, track_id: String) -> Result<Applied, String> {
    let index = project
        .track_index(&track_id)
        .ok_or("that track is not in this project")?;
    let kind = project.tracks[index].kind;
    let siblings: Vec<&str> = project
        .tracks_of(kind)
        .map(|track| track.id.as_str())
        .collect();
    if siblings.len() <= 1 {
        return Err("the last track of a kind stays".into());
    }
    if siblings[siblings.len() - 1] != track_id {
        return Err("only the last track of a kind can be removed".into());
    }
    let track = project.tracks.remove(index);
    Ok(Applied {
        resolved: Command::RemoveTrack { track_id },
        inverse: Command::RestoreTracks {
            entries: vec![TrackAt { index, track }],
        },
    })
}

fn set_track_flags(
    project: &mut Project,
    track_id: String,
    muted: Option<bool>,
    hidden: Option<bool>,
) -> Result<Applied, String> {
    let track = project
        .track_mut(&track_id)
        .ok_or("that track is not in this project")?;
    let was_muted = track.muted;
    let was_hidden = track.hidden;
    if let Some(value) = muted {
        track.muted = value;
    }
    if let Some(value) = hidden {
        track.hidden = value;
    }
    Ok(Applied {
        inverse: Command::SetTrackFlags {
            track_id: track_id.clone(),
            muted: muted.map(|_| was_muted),
            hidden: hidden.map(|_| was_hidden),
        },
        resolved: Command::SetTrackFlags {
            track_id,
            muted,
            hidden,
        },
    })
}

fn add_clip(
    project: &mut Project,
    ids: &mut Ids,
    track_id: String,
    asset_id: String,
    start: i64,
    id: Option<String>,
    link_group: Option<String>,
) -> Result<Applied, String> {
    let rate = project.rate();
    let asset = project
        .asset(&asset_id)
        .ok_or("that asset is not in this project")?
        .clone();
    let track = project
        .track_mut(&track_id)
        .ok_or("that track is not in this project")?;
    if !track.accepts(&asset) {
        return Err(format!("a {:?} track will not take that", track.kind).to_lowercase());
    }
    let duration = asset.initial_clip_frames(rate);
    let free_start = track.free_start(start, duration, None);
    if link_group.is_some() && free_start != start {
        return Err("there is no room to add every linked clip together".into());
    }
    let start = free_start;
    let id = id.unwrap_or_else(|| ids.make('c'));
    track.clips.push(Clip {
        id: id.clone(),
        asset_id: asset_id.clone(),
        link_group: link_group.clone(),
        start,
        in_point: 0,
        out_point: duration,
        volume: 1.0,
        opacity: 1.0,
    });
    track.sort();
    Ok(Applied {
        resolved: Command::AddClip {
            track_id,
            asset_id,
            start,
            id: Some(id.clone()),
            link_group,
        },
        inverse: Command::DropClips { clip_ids: vec![id] },
    })
}

fn move_clip(
    project: &mut Project,
    clip_id: String,
    track_id: String,
    start: i64,
) -> Result<Applied, String> {
    let was = project
        .placement(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    if was.clip.link_group.is_some() {
        return move_linked_clips(project, clip_id, track_id, start);
    }
    let asset = project.asset(&was.clip.asset_id).cloned();
    let target = project
        .track_index(&track_id)
        .ok_or("that track is not in this project")?;
    match asset {
        // A clip whose asset has gone is still draggable; there is nothing left
        // to say which tracks would take it, so it stays on the kind it is on.
        Some(asset) if !project.tracks[target].accepts(&asset) => {
            return Err(format!(
                "a {:?} track will not take that",
                project.tracks[target].kind
            )
            .to_lowercase())
        }
        None if project.tracks[target].kind != project.track(&was.track_id).unwrap().kind => {
            return Err("that clip has lost its file, so it can only move on its own kind".into())
        }
        _ => {}
    }

    let mut clip = was.clip.clone();
    let duration = clip.duration_frames();
    for track in &mut project.tracks {
        track.clips.retain(|candidate| candidate.id != clip_id);
    }
    let start = project.tracks[target].free_start(start, duration, None);
    clip.start = start;
    project.tracks[target].clips.push(clip);
    project.tracks[target].sort();
    Ok(Applied {
        resolved: Command::MoveClip {
            clip_id,
            track_id,
            start,
        },
        inverse: Command::RestoreClips { entries: vec![was] },
    })
}

fn move_linked_clips(
    project: &mut Project,
    clip_id: String,
    track_id: String,
    start: i64,
) -> Result<Applied, String> {
    let selected = project
        .placement(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let placements = project.linked_placements(&clip_id);
    let delta = start - selected.clip.start;
    let ignored: Vec<&str> = placements
        .iter()
        .map(|entry| entry.clip.id.as_str())
        .collect();
    let mut targets = Vec::with_capacity(placements.len());

    for entry in &placements {
        let destination = if entry.clip.id == clip_id {
            track_id.as_str()
        } else {
            entry.track_id.as_str()
        };
        let target = project
            .track(destination)
            .ok_or("that track is not in this project")?;
        let asset = project
            .asset(&entry.clip.asset_id)
            .ok_or("that linked clip has lost its file")?;
        if !target.accepts(asset) {
            return Err(format!("a {:?} track will not take that", target.kind).to_lowercase());
        }
        let wanted = entry.clip.start + delta;
        if wanted < 0 {
            return Err("linked clips would start before the timeline does".into());
        }
        let duration = entry.clip.duration_frames();
        let occupied = target.clips.iter().any(|other| {
            !ignored.contains(&other.id.as_str())
                && wanted < other.end_frame()
                && other.start < wanted + duration
        });
        if occupied {
            return Err("there is no room to move every linked clip together".into());
        }
        targets.push((entry.clip.id.clone(), destination.to_string(), wanted));
    }

    for track in &mut project.tracks {
        track
            .clips
            .retain(|clip| !ignored.contains(&clip.id.as_str()));
    }
    for (id, destination, wanted) in &targets {
        let mut clip = placements
            .iter()
            .find(|entry| entry.clip.id == *id)
            .expect("planned from this set")
            .clip
            .clone();
        clip.start = *wanted;
        project
            .track_mut(destination)
            .expect("destination was checked")
            .clips
            .push(clip);
    }
    for track in &mut project.tracks {
        track.sort();
    }
    Ok(Applied {
        resolved: Command::MoveClip {
            clip_id,
            track_id,
            start,
        },
        inverse: Command::RestoreClips {
            entries: placements,
        },
    })
}

fn trim_clip(
    project: &mut Project,
    clip_id: String,
    edge: Edge,
    frame: i64,
) -> Result<Applied, String> {
    let entries = project.linked_placements(&clip_id);
    if entries.is_empty() {
        return Err("that clip is not on the timeline".into());
    }
    let mut selected_frame = frame;
    for entry in &entries {
        let at = trim_one(project, &entry.clip.id, edge, frame)?;
        if entry.clip.id == clip_id {
            selected_frame = at;
        }
    }
    Ok(Applied {
        resolved: Command::TrimClip {
            clip_id,
            edge,
            frame: selected_frame,
        },
        inverse: Command::RestoreClips { entries },
    })
}

fn trim_one(project: &mut Project, clip_id: &str, edge: Edge, frame: i64) -> Result<i64, String> {
    let rate = project.rate();
    let shortest = min_clip_frames(rate);
    let clip = project
        .clip(clip_id)
        .ok_or("that clip is not on the timeline")?;
    let limit = project
        .asset(&clip.asset_id)
        .and_then(|asset| asset.source_limit_frames(rate));
    let (track_index, clip_index) = project.locate(clip_id).expect("just found it");
    let track = &project.tracks[track_index];

    // A trim may not run into the neighbour: overlapping clips are a state the
    // timeline has no answer for, and the edge stopping at the clip next door
    // is what every editor does anyway.
    let previous_end = track.clips[..clip_index]
        .iter()
        .map(Clip::end_frame)
        .max()
        .unwrap_or(0);
    let next_start = track
        .clips
        .get(clip_index + 1)
        .map(|clip| clip.start)
        .unwrap_or(i64::MAX);

    let clip = &mut project.tracks[track_index].clips[clip_index];
    let at = match edge {
        Edge::Start => {
            let earliest = (clip.start - clip.in_point).max(0).max(previous_end);
            let latest = (clip.end_frame() - shortest).max(earliest);
            let at = frame.clamp(earliest, latest);
            clip.in_point += at - clip.start;
            clip.start = at;
            at
        }
        Edge::End => {
            let earliest = clip.start + shortest;
            let source = limit
                .map(|limit| clip.start + (limit - clip.in_point))
                .unwrap_or(i64::MAX);
            let latest = source.min(next_start).max(earliest);
            let at = frame.clamp(earliest, latest);
            clip.out_point = clip.in_point + (at - clip.start);
            at
        }
    };
    project.tracks[track_index].sort();
    Ok(at)
}

fn split_at(
    project: &mut Project,
    ids: &mut Ids,
    frame: i64,
    clip_id: Option<String>,
    given: Vec<String>,
    given_groups: Vec<Option<String>>,
) -> Applied {
    let shortest = min_clip_frames(project.rate());
    let mut made = Vec::new();
    let mut originals = Vec::new();
    let mut given = given.into_iter();
    let mut given_groups = given_groups.into_iter();
    let selected_group = clip_id
        .as_deref()
        .and_then(|id| project.clip(id))
        .and_then(|clip| clip.link_group.clone());
    let mut split_groups = HashMap::new();
    let mut made_groups = Vec::new();

    for track in &mut project.tracks {
        let mut created = Vec::new();
        for clip in &mut track.clips {
            if let Some(only) = clip_id.as_deref() {
                if clip.id != only {
                    match selected_group.as_deref() {
                        Some(group) if clip.link_group.as_deref() == Some(group) => {}
                        _ => continue,
                    }
                }
            }
            if frame <= clip.start || frame >= clip.end_frame() {
                continue;
            }
            let offset = frame - clip.start;
            // Neither half may come out too short to grab again.
            if offset < shortest || clip.duration_frames() - offset < shortest {
                continue;
            }
            originals.push(ClipAt {
                track_id: track.id.clone(),
                clip: clip.clone(),
            });
            let id = given.next().unwrap_or_else(|| ids.make('c'));
            let link_group = given_groups.next().unwrap_or_else(|| {
                clip.link_group.as_ref().map(|group| {
                    split_groups
                        .entry(group.clone())
                        .or_insert_with(|| ids.make('g'))
                        .clone()
                })
            });
            created.push(Clip {
                id: id.clone(),
                asset_id: clip.asset_id.clone(),
                link_group: link_group.clone(),
                start: frame,
                in_point: clip.in_point + offset,
                out_point: clip.out_point,
                volume: clip.volume,
                opacity: clip.opacity,
            });
            made.push(id);
            made_groups.push(link_group);
            clip.out_point = clip.in_point + offset;
        }
        if !created.is_empty() {
            track.clips.extend(created);
            track.sort();
        }
    }

    if made.is_empty() {
        return Applied {
            resolved: nothing(),
            inverse: nothing(),
        };
    }
    Applied {
        resolved: Command::SplitAt {
            frame,
            clip_id,
            ids: made.clone(),
            link_groups: made_groups,
        },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropClips { clip_ids: made },
                Command::RestoreClips { entries: originals },
            ],
        },
    }
}

fn remove_clip(project: &mut Project, clip_id: String) -> Result<Applied, String> {
    let entries = project.linked_placements(&clip_id);
    if entries.is_empty() {
        return Err("that clip is not on the timeline".into());
    }
    let ids: Vec<&str> = entries.iter().map(|entry| entry.clip.id.as_str()).collect();
    for track in &mut project.tracks {
        track.clips.retain(|clip| !ids.contains(&clip.id.as_str()));
    }
    Ok(Applied {
        resolved: Command::RemoveClip { clip_id },
        inverse: Command::RestoreClips { entries },
    })
}

fn link_clips(
    project: &mut Project,
    ids: &mut Ids,
    clip_ids: Vec<String>,
    link_group: Option<String>,
) -> Result<Applied, String> {
    if clip_ids.len() != 2 || clip_ids[0] == clip_ids[1] {
        return Err("link exactly one video clip and one audio clip".into());
    }
    let entries: Vec<ClipAt> = clip_ids
        .iter()
        .map(|id| {
            project
                .placement(id)
                .ok_or("that clip is not on the timeline")
        })
        .collect::<Result<_, _>>()?;
    let first_track = project
        .track(&entries[0].track_id)
        .expect("placement has a track");
    let second_track = project
        .track(&entries[1].track_id)
        .expect("placement has a track");
    let first = &entries[0].clip;
    let second = &entries[1].clip;
    if first_track.kind == second_track.kind
        || first.asset_id != second.asset_id
        || first.start != second.start
        || first.in_point != second.in_point
        || first.out_point != second.out_point
    {
        return Err("only synchronized video and audio clips from one asset can be linked".into());
    }
    if first.link_group.is_some() || second.link_group.is_some() {
        return Err("unlink those clips before linking them again".into());
    }
    let group = link_group.unwrap_or_else(|| ids.make('g'));
    for id in &clip_ids {
        let (track, clip) = project.locate(id).expect("just found it");
        project.tracks[track].clips[clip].link_group = Some(group.clone());
    }
    Ok(Applied {
        resolved: Command::LinkClips {
            clip_ids,
            link_group: Some(group),
        },
        inverse: Command::RestoreClips { entries },
    })
}

fn unlink_clips(project: &mut Project, clip_id: String) -> Result<Applied, String> {
    let entries = project.linked_placements(&clip_id);
    if entries.len() < 2 {
        return Err("that clip is not linked".into());
    }
    let ids: Vec<String> = entries.iter().map(|entry| entry.clip.id.clone()).collect();
    for id in ids {
        let (track, clip) = project.locate(&id).expect("just found it");
        project.tracks[track].clips[clip].link_group = None;
    }
    Ok(Applied {
        resolved: Command::UnlinkClips { clip_id },
        inverse: Command::RestoreClips { entries },
    })
}

/// Delete and close the gap. Everything after it on the same track moves left
/// by exactly the length that went, so the order and the spacing of what is
/// left are untouched and nothing can end up overlapping.
fn ripple_delete(project: &mut Project, clip_id: String) -> Result<Applied, String> {
    let removed = project.linked_placements(&clip_id);
    if removed.is_empty() {
        return Err("that clip is not on the timeline".into());
    }
    let removed_ids: Vec<&str> = removed.iter().map(|entry| entry.clip.id.as_str()).collect();
    let mut restore = removed.clone();
    for entry in &removed {
        let track = project
            .track_mut(&entry.track_id)
            .expect("placement has a track");
        track
            .clips
            .retain(|clip| !removed_ids.contains(&clip.id.as_str()));
        for clip in &mut track.clips {
            if clip.start >= entry.clip.end_frame() {
                restore.push(ClipAt {
                    track_id: entry.track_id.clone(),
                    clip: clip.clone(),
                });
                clip.start = (clip.start - entry.clip.duration_frames()).max(0);
            }
        }
        track.sort();
    }
    Ok(Applied {
        resolved: Command::RippleDelete { clip_id },
        inverse: Command::RestoreClips { entries: restore },
    })
}

/// Close one of a track's internal gaps. Leading and trailing space is not a
/// gap to ripple: there must be a clip on both sides for the range to have an
/// unambiguous owner. A linked clip brings its counterpart with it, which is
/// the same rule a direct move follows.
fn ripple_delete_gap(
    project: &mut Project,
    track_id: String,
    start: i64,
    end: i64,
) -> Result<Applied, String> {
    if start < 0 || end <= start {
        return Err("that is not a timeline gap".into());
    }
    let track = project
        .track(&track_id)
        .ok_or("that track is not in this project")?;
    let is_gap = track
        .clips
        .windows(2)
        .any(|clips| clips[0].end_frame() == start && clips[1].start == end);
    if !is_gap {
        return Err("that gap is no longer on the timeline".into());
    }

    let selected_ids: Vec<String> = track
        .clips
        .iter()
        .filter(|clip| clip.start >= end)
        .map(|clip| clip.id.clone())
        .collect();
    let mut moved_ids = HashSet::new();
    let mut moved = Vec::new();
    for clip_id in selected_ids {
        for entry in project.linked_placements(&clip_id) {
            if moved_ids.insert(entry.clip.id.clone()) {
                moved.push(entry);
            }
        }
    }
    let amount = end - start;
    let mut after = project.clone();
    shift_clips_left(&mut after, &moved_ids, amount);
    after
        .validate()
        .map_err(|_| "closing that gap would overlap a linked clip".to_string())?;
    shift_clips_left(project, &moved_ids, amount);

    Ok(Applied {
        resolved: Command::RippleDeleteGap {
            track_id,
            start,
            end,
        },
        inverse: Command::RestoreClips { entries: moved },
    })
}

fn shift_clips_left(project: &mut Project, moved_ids: &HashSet<String>, amount: i64) {
    for track in &mut project.tracks {
        for clip in &mut track.clips {
            if moved_ids.contains(&clip.id) {
                clip.start -= amount;
            }
        }
        track.sort();
    }
}

fn set_clip_gain(
    project: &mut Project,
    clip_id: String,
    volume: Option<f32>,
    opacity: Option<f32>,
) -> Result<Applied, String> {
    let (track_index, clip_index) = project
        .locate(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let clip = &mut project.tracks[track_index].clips[clip_index];
    let was_volume = clip.volume;
    let was_opacity = clip.opacity;
    if let Some(value) = volume {
        clip.volume = value.clamp(0.0, 1.0);
    }
    if let Some(value) = opacity {
        clip.opacity = value.clamp(0.0, 1.0);
    }
    Ok(Applied {
        inverse: Command::SetClipGain {
            clip_id: clip_id.clone(),
            volume: volume.map(|_| was_volume),
            opacity: opacity.map(|_| was_opacity),
        },
        resolved: Command::SetClipGain {
            clip_id,
            volume,
            opacity,
        },
    })
}

#[allow(clippy::too_many_arguments)]
fn add_visual_item(
    project: &mut Project,
    ids: &mut Ids,
    track_id: String,
    content: VisualContent,
    start: i64,
    duration: i64,
    transform: VisualTransform,
    z_index: i32,
    id: Option<String>,
) -> Result<Applied, String> {
    validate_visual_content(project, &content)?;
    let track_index = project
        .track_index(&track_id)
        .ok_or("that track is not in this project")?;
    if project.tracks[track_index].kind != TrackKind::Video {
        return Err("visual items belong on video tracks".into());
    }
    let id = id.unwrap_or_else(|| ids.make('i'));
    if project.visual_item(&id).is_some() {
        return Err("that visual item id is already in this project".into());
    }
    let item = VisualItem {
        id: id.clone(),
        start,
        duration,
        transform,
        z_index,
        content: content.clone(),
    };
    project.tracks[track_index].visual_items.push(item);
    Ok(Applied {
        resolved: Command::AddVisualItem {
            track_id,
            content,
            start,
            duration,
            transform,
            z_index,
            id: Some(id.clone()),
        },
        inverse: Command::DropVisualItems { item_ids: vec![id] },
    })
}

fn set_visual_transform(
    project: &mut Project,
    item_id: String,
    transform: VisualTransform,
) -> Result<Applied, String> {
    let (track, item) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let previous = project.tracks[track].visual_items[item].transform;
    project.tracks[track].visual_items[item].transform = transform;
    Ok(Applied {
        resolved: Command::SetVisualTransform {
            item_id: item_id.clone(),
            transform,
        },
        inverse: Command::SetVisualTransform {
            item_id,
            transform: previous,
        },
    })
}

fn set_visual_timing(
    project: &mut Project,
    item_id: String,
    start: i64,
    duration: i64,
) -> Result<Applied, String> {
    let (track, item) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let previous = &project.tracks[track].visual_items[item];
    let (was_start, was_duration) = (previous.start, previous.duration);
    let item = &mut project.tracks[track].visual_items[item];
    item.start = start;
    item.duration = duration;
    Ok(Applied {
        resolved: Command::SetVisualTiming {
            item_id: item_id.clone(),
            start,
            duration,
        },
        inverse: Command::SetVisualTiming {
            item_id,
            start: was_start,
            duration: was_duration,
        },
    })
}

fn set_visual_z_index(
    project: &mut Project,
    item_id: String,
    z_index: i32,
) -> Result<Applied, String> {
    let (track, item) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let previous = project.tracks[track].visual_items[item].z_index;
    project.tracks[track].visual_items[item].z_index = z_index;
    Ok(Applied {
        resolved: Command::SetVisualZIndex {
            item_id: item_id.clone(),
            z_index,
        },
        inverse: Command::SetVisualZIndex {
            item_id,
            z_index: previous,
        },
    })
}

fn set_visual_content(
    project: &mut Project,
    item_id: String,
    content: VisualContent,
) -> Result<Applied, String> {
    validate_visual_content(project, &content)?;
    let (track, item) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let previous = project.tracks[track].visual_items[item].content.clone();
    project.tracks[track].visual_items[item].content = content.clone();
    Ok(Applied {
        resolved: Command::SetVisualContent {
            item_id: item_id.clone(),
            content,
        },
        inverse: Command::SetVisualContent {
            item_id,
            content: previous,
        },
    })
}

fn validate_visual_content(project: &Project, content: &VisualContent) -> Result<(), String> {
    let Some(asset_id) = content.asset_id() else {
        return Ok(());
    };
    let asset = project
        .asset(asset_id)
        .ok_or("that visual item asset is not in this project")?;
    match (content, asset.kind) {
        (VisualContent::Image { .. }, crate::AssetKind::Image)
        | (VisualContent::VideoOverlay { .. }, crate::AssetKind::Video) => Ok(()),
        (VisualContent::Image { .. }, _) => Err("an image item needs an image asset".into()),
        (VisualContent::VideoOverlay { .. }, _) => {
            Err("a video overlay needs a video asset".into())
        }
        (VisualContent::Text { .. } | VisualContent::Shape, _) => Ok(()),
    }
}

fn remove_visual_item(project: &mut Project, item_id: String) -> Result<Applied, String> {
    let entry = project
        .visual_item_placement(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    for track in &mut project.tracks {
        track.visual_items.retain(|item| item.id != item_id);
    }
    Ok(Applied {
        resolved: Command::RemoveVisualItem { item_id },
        inverse: Command::RestoreVisualItems {
            entries: vec![entry],
        },
    })
}

/// Changing the timebase carries the edit with it, so a project cut at 30 and
/// then set to 29.97 keeps every clip where it was in time rather than where it
/// was in frame numbers.
///
/// The inverse puts the old rate back and then restores every clip, rather than
/// trusting a second rescale to land back where it started: rounding to the
/// nearest frame of a rate is not reversible, and a project that came back from
/// undo one frame out would be a bug nobody could see until the render.
fn set_settings(project: &mut Project, settings: ProjectSettings) -> Applied {
    let was = project.settings;
    let from = was.rate;
    let to = settings.rate;
    project.settings = settings;
    if from == to {
        return Applied {
            resolved: Command::SetSettings { settings },
            inverse: Command::SetSettings { settings: was },
        };
    }

    let mut restore = Vec::new();
    let mut restore_items = Vec::new();
    let mut restore_markers = Vec::new();
    for (index, marker) in project.markers.iter_mut().enumerate() {
        restore_markers.push(MarkerAt {
            index,
            marker: marker.clone(),
        });
        marker.frame = rescale(marker.frame, from, to);
    }
    for track in &mut project.tracks {
        for clip in &mut track.clips {
            restore.push(ClipAt {
                track_id: track.id.clone(),
                clip: clip.clone(),
            });
            clip.start = rescale(clip.start, from, to);
            clip.in_point = rescale(clip.in_point, from, to);
            // A clip that rounds away to nothing on a slower rate keeps the one
            // frame that makes it a clip at all.
            clip.out_point = rescale(clip.out_point, from, to).max(clip.in_point + 1);
        }
        for item in &mut track.visual_items {
            restore_items.push(VisualItemAt {
                track_id: track.id.clone(),
                item: item.clone(),
            });
            item.start = rescale(item.start, from, to);
            item.duration = rescale(item.duration, from, to).max(1);
        }
        track.sort();
    }
    Applied {
        resolved: Command::SetSettings { settings },
        inverse: Command::Transaction {
            commands: vec![
                Command::SetSettings { settings: was },
                Command::RestoreClips { entries: restore },
                Command::RestoreVisualItems {
                    entries: restore_items,
                },
                Command::RestoreMarkers {
                    entries: restore_markers,
                },
            ],
        },
    }
}

fn rescale(value: i64, from: Rate, to: Rate) -> i64 {
    crate::RationalTime::new(value, from).rescaled(to).value()
}

fn add_marker(
    project: &mut Project,
    ids: &mut Ids,
    frame: i64,
    name: String,
    color: String,
    id: Option<String>,
) -> Result<Applied, String> {
    if frame < 0 {
        return Err("a marker cannot be before the timeline starts".into());
    }
    let id = id.unwrap_or_else(|| ids.make('m'));
    if project.marker(&id).is_some() {
        return Err("that marker already exists".into());
    }
    let marker = Marker {
        id: id.clone(),
        frame,
        name,
        color: if color.trim().is_empty() {
            "#e6a700".into()
        } else {
            color
        },
    };
    let index = project.markers.partition_point(|item| item.frame <= frame);
    project.markers.insert(index, marker.clone());
    Ok(Applied {
        resolved: Command::AddMarker {
            frame,
            name: marker.name,
            color: marker.color,
            id: Some(id.clone()),
        },
        inverse: Command::DropMarkers {
            marker_ids: vec![id],
        },
    })
}

fn set_marker(
    project: &mut Project,
    marker_id: String,
    frame: Option<i64>,
    name: Option<String>,
    color: Option<String>,
) -> Result<Applied, String> {
    let index = project
        .markers
        .iter()
        .position(|marker| marker.id == marker_id)
        .ok_or("that marker is not in this project")?;
    let previous = MarkerAt {
        index,
        marker: project.markers[index].clone(),
    };
    let marker = &mut project.markers[index];
    if let Some(frame) = frame {
        if frame < 0 {
            return Err("a marker cannot be before the timeline starts".into());
        }
        marker.frame = frame;
    }
    if let Some(name) = name {
        marker.name = name;
    }
    if let Some(color) = color {
        if color.trim().is_empty() {
            return Err("a marker needs a color".into());
        }
        marker.color = color;
    }
    project.markers.sort_by(|left, right| {
        left.frame
            .cmp(&right.frame)
            .then_with(|| left.id.cmp(&right.id))
    });
    let marker = project.marker(&marker_id).expect("marker was just updated");
    Ok(Applied {
        resolved: Command::SetMarker {
            marker_id,
            frame: Some(marker.frame),
            name: Some(marker.name.clone()),
            color: Some(marker.color.clone()),
        },
        inverse: Command::RestoreMarkers {
            entries: vec![previous],
        },
    })
}

fn remove_marker(project: &mut Project, marker_id: String) -> Result<Applied, String> {
    let index = project
        .markers
        .iter()
        .position(|marker| marker.id == marker_id)
        .ok_or("that marker is not in this project")?;
    let marker = project.markers.remove(index);
    Ok(Applied {
        resolved: Command::RemoveMarker { marker_id },
        inverse: Command::RestoreMarkers {
            entries: vec![MarkerAt { index, marker }],
        },
    })
}

fn restore_clips(project: &mut Project, entries: Vec<ClipAt>) -> Applied {
    let mut previous = Vec::new();
    let mut invented = Vec::new();
    for entry in &entries {
        match project.placement(&entry.clip.id) {
            Some(placement) => previous.push(placement),
            None => invented.push(entry.clip.id.clone()),
        }
        for track in &mut project.tracks {
            track.clips.retain(|clip| clip.id != entry.clip.id);
        }
        if let Some(track) = project.track_mut(&entry.track_id) {
            track.clips.push(entry.clip.clone());
            track.sort();
        }
    }
    Applied {
        resolved: Command::RestoreClips { entries },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropClips { clip_ids: invented },
                Command::RestoreClips { entries: previous },
            ],
        },
    }
}

fn drop_clips(project: &mut Project, clip_ids: Vec<String>) -> Applied {
    let previous: Vec<ClipAt> = clip_ids
        .iter()
        .filter_map(|id| project.placement(id))
        .collect();
    for track in &mut project.tracks {
        track.clips.retain(|clip| !clip_ids.contains(&clip.id));
    }
    Applied {
        resolved: Command::DropClips { clip_ids },
        inverse: Command::RestoreClips { entries: previous },
    }
}

fn restore_assets(project: &mut Project, entries: Vec<AssetAt>) -> Applied {
    let mut previous = Vec::new();
    let mut invented = Vec::new();
    for entry in &entries {
        match project.asset_index(&entry.asset.id) {
            Some(index) => {
                previous.push(AssetAt {
                    index,
                    asset: project.assets[index].clone(),
                });
                project.assets[index] = entry.asset.clone();
            }
            None => {
                invented.push(entry.asset.id.clone());
                let index = entry.index.min(project.assets.len());
                project.assets.insert(index, entry.asset.clone());
            }
        }
    }
    Applied {
        resolved: Command::RestoreAssets { entries },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropAssets {
                    asset_ids: invented,
                },
                Command::RestoreAssets { entries: previous },
            ],
        },
    }
}

fn drop_assets(project: &mut Project, asset_ids: Vec<String>) -> Applied {
    let previous: Vec<AssetAt> = asset_ids
        .iter()
        .filter_map(|id| {
            let index = project.asset_index(id)?;
            Some(AssetAt {
                index,
                asset: project.assets[index].clone(),
            })
        })
        .collect();
    project
        .assets
        .retain(|asset| !asset_ids.contains(&asset.id));
    Applied {
        resolved: Command::DropAssets { asset_ids },
        inverse: Command::RestoreAssets { entries: previous },
    }
}

fn restore_tracks(project: &mut Project, entries: Vec<TrackAt>) -> Applied {
    let mut ids = Vec::new();
    for entry in &entries {
        project.tracks.retain(|track| track.id != entry.track.id);
        let index = entry.index.min(project.tracks.len());
        project.tracks.insert(index, entry.track.clone());
        ids.push(entry.track.id.clone());
    }
    Applied {
        resolved: Command::RestoreTracks { entries },
        inverse: Command::DropTracks { track_ids: ids },
    }
}

fn drop_tracks(project: &mut Project, track_ids: Vec<String>) -> Applied {
    let previous: Vec<TrackAt> = track_ids
        .iter()
        .filter_map(|id| {
            let index = project.track_index(id)?;
            Some(TrackAt {
                index,
                track: project.tracks[index].clone(),
            })
        })
        .collect();
    project
        .tracks
        .retain(|track| !track_ids.contains(&track.id));
    Applied {
        resolved: Command::DropTracks { track_ids },
        inverse: Command::RestoreTracks { entries: previous },
    }
}

fn restore_visual_items(project: &mut Project, entries: Vec<VisualItemAt>) -> Applied {
    let mut previous = Vec::new();
    let mut invented = Vec::new();
    for entry in &entries {
        match project.visual_item_placement(&entry.item.id) {
            Some(placement) => previous.push(placement),
            None => invented.push(entry.item.id.clone()),
        }
        for track in &mut project.tracks {
            track.visual_items.retain(|item| item.id != entry.item.id);
        }
        if let Some(track) = project.track_mut(&entry.track_id) {
            track.visual_items.push(entry.item.clone());
        }
    }
    Applied {
        resolved: Command::RestoreVisualItems { entries },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropVisualItems { item_ids: invented },
                Command::RestoreVisualItems { entries: previous },
            ],
        },
    }
}

fn drop_visual_items(project: &mut Project, item_ids: Vec<String>) -> Applied {
    let previous: Vec<VisualItemAt> = item_ids
        .iter()
        .filter_map(|id| project.visual_item_placement(id))
        .collect();
    for track in &mut project.tracks {
        track
            .visual_items
            .retain(|item| !item_ids.contains(&item.id));
    }
    Applied {
        resolved: Command::DropVisualItems { item_ids },
        inverse: Command::RestoreVisualItems { entries: previous },
    }
}

fn restore_markers(project: &mut Project, entries: Vec<MarkerAt>) -> Applied {
    let mut previous = Vec::new();
    let mut invented = Vec::new();
    for entry in &entries {
        if let Some(index) = project
            .markers
            .iter()
            .position(|marker| marker.id == entry.marker.id)
        {
            previous.push(MarkerAt {
                index,
                marker: project.markers[index].clone(),
            });
            project.markers.remove(index);
        } else {
            invented.push(entry.marker.id.clone());
        }
        project
            .markers
            .insert(entry.index.min(project.markers.len()), entry.marker.clone());
    }
    Applied {
        resolved: Command::RestoreMarkers { entries },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropMarkers {
                    marker_ids: invented,
                },
                Command::RestoreMarkers { entries: previous },
            ],
        },
    }
}

fn drop_markers(project: &mut Project, marker_ids: Vec<String>) -> Applied {
    let previous = marker_ids
        .iter()
        .filter_map(|id| {
            project
                .markers
                .iter()
                .position(|marker| marker.id == *id)
                .map(|index| MarkerAt {
                    index,
                    marker: project.markers[index].clone(),
                })
        })
        .collect();
    project
        .markers
        .retain(|marker| !marker_ids.contains(&marker.id));
    Applied {
        resolved: Command::DropMarkers { marker_ids },
        inverse: Command::RestoreMarkers { entries: previous },
    }
}
