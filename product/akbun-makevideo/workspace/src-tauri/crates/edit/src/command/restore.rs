//! The restore and drop primitives every inverse is built from.

use super::*;

pub(super) fn restore_clips(project: &mut Project, entries: Vec<ClipAt>) -> Applied {
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

pub(super) fn drop_clips(project: &mut Project, clip_ids: Vec<String>) -> Applied {
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

pub(super) fn restore_assets(project: &mut Project, entries: Vec<AssetAt>) -> Applied {
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

pub(super) fn drop_assets(project: &mut Project, asset_ids: Vec<String>) -> Applied {
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

pub(super) fn restore_tracks(project: &mut Project, entries: Vec<TrackAt>) -> Applied {
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

pub(super) fn drop_tracks(project: &mut Project, track_ids: Vec<String>) -> Applied {
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

pub(super) fn restore_visual_items(project: &mut Project, entries: Vec<VisualItemAt>) -> Applied {
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

pub(super) fn drop_visual_items(project: &mut Project, item_ids: Vec<String>) -> Applied {
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

pub(super) fn restore_markers(project: &mut Project, entries: Vec<MarkerAt>) -> Applied {
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

pub(super) fn drop_markers(project: &mut Project, marker_ids: Vec<String>) -> Applied {
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

pub(super) fn restore_transitions(project: &mut Project, entries: Vec<TransitionAt>) -> Applied {
    let mut previous = Vec::new();
    let mut invented = Vec::new();
    for entry in &entries {
        if let Some(index) = project
            .transitions
            .iter()
            .position(|transition| transition.id == entry.transition.id)
        {
            previous.push(TransitionAt {
                index,
                transition: project.transitions.remove(index),
            });
        } else {
            invented.push(entry.transition.id.clone());
        }
        project.transitions.insert(
            entry.index.min(project.transitions.len()),
            entry.transition.clone(),
        );
    }
    Applied {
        resolved: Command::RestoreTransitions { entries },
        inverse: Command::Transaction {
            commands: vec![
                Command::DropTransitions {
                    transition_ids: invented,
                },
                Command::RestoreTransitions { entries: previous },
            ],
        },
    }
}

pub(super) fn drop_transitions(project: &mut Project, transition_ids: Vec<String>) -> Applied {
    let previous = transition_ids
        .iter()
        .filter_map(|id| {
            project
                .transitions
                .iter()
                .position(|transition| transition.id == *id)
                .map(|index| TransitionAt {
                    index,
                    transition: project.transitions[index].clone(),
                })
        })
        .collect();
    project
        .transitions
        .retain(|transition| !transition_ids.contains(&transition.id));
    Applied {
        resolved: Command::DropTransitions { transition_ids },
        inverse: Command::RestoreTransitions { entries: previous },
    }
}

pub(super) fn restore_timeline(
    project: &mut Project,
    tracks: Vec<Track>,
    transitions: Vec<Transition>,
    markers: Vec<Marker>,
) -> Applied {
    let previous = Command::RestoreTimeline {
        tracks: std::mem::replace(&mut project.tracks, tracks.clone()),
        transitions: std::mem::replace(&mut project.transitions, transitions.clone()),
        markers: std::mem::replace(&mut project.markers, markers.clone()),
    };
    Applied {
        resolved: Command::RestoreTimeline {
            tracks,
            transitions,
            markers,
        },
        inverse: previous,
    }
}
