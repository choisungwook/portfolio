//! Adding and removing assets and tracks, and the per-track switches.

use super::*;

pub(super) fn add_assets(project: &mut Project, assets: Vec<Asset>) -> Applied {
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

pub(super) fn remove_asset(project: &mut Project, asset_id: String) -> Result<Applied, String> {
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
            if item.content.references_asset(&asset_id) {
                orphan_items.push(VisualItemAt {
                    track_id: track.id.clone(),
                    item: item.clone(),
                });
            }
        }
        track
            .visual_items
            .retain(|item| !item.content.references_asset(&asset_id));
    }
    let orphan_ids: Vec<&str> = orphans.iter().map(|entry| entry.clip.id.as_str()).collect();
    let transitions: Vec<TransitionAt> = project
        .transitions
        .iter()
        .enumerate()
        .filter(|(_, transition)| {
            orphan_ids.contains(&transition.from_clip_id.as_str())
                || orphan_ids.contains(&transition.to_clip_id.as_str())
        })
        .map(|(index, transition)| TransitionAt {
            index,
            transition: transition.clone(),
        })
        .collect();
    project.transitions.retain(|transition| {
        !orphan_ids.contains(&transition.from_clip_id.as_str())
            && !orphan_ids.contains(&transition.to_clip_id.as_str())
    });
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
                Command::RestoreTransitions {
                    entries: transitions,
                },
            ],
        },
    })
}

pub(super) fn add_track(
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
        subtitle_style: (kind == TrackKind::Subtitle).then(TextStyle::default),
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
pub(super) fn remove_track(project: &mut Project, track_id: String) -> Result<Applied, String> {
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
    let transitions: Vec<TransitionAt> = project
        .transitions
        .iter()
        .enumerate()
        .filter(|(_, transition)| transition.track_id == track_id)
        .map(|(index, transition)| TransitionAt {
            index,
            transition: transition.clone(),
        })
        .collect();
    project
        .transitions
        .retain(|transition| transition.track_id != track_id);
    Ok(Applied {
        resolved: Command::RemoveTrack { track_id },
        inverse: Command::Transaction {
            commands: vec![
                Command::RestoreTracks {
                    entries: vec![TrackAt { index, track }],
                },
                Command::RestoreTransitions {
                    entries: transitions,
                },
            ],
        },
    })
}

pub(super) fn set_track_flags(
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

pub(super) fn set_subtitle_style(
    project: &mut Project,
    track_id: String,
    style: TextStyle,
) -> Result<Applied, String> {
    let track = project
        .track_mut(&track_id)
        .ok_or("that track is not on the timeline")?;
    if track.kind != TrackKind::Subtitle {
        return Err("subtitle style belongs on a subtitle track".into());
    }
    let previous = track.subtitle_style.clone().unwrap_or_default();
    track.subtitle_style = Some(style.clone());
    Ok(Applied {
        resolved: Command::SetSubtitleStyle {
            track_id: track_id.clone(),
            style,
        },
        inverse: Command::SetSubtitleStyle {
            track_id,
            style: previous,
        },
    })
}
