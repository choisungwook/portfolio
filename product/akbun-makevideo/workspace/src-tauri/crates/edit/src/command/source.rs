//! Placing source media on the timeline

use super::*;

pub(super) fn add_clip(
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
        lut_path: None,
        start,
        in_point: 0,
        out_point: duration,
        volume: 1.0,
        opacity: 1.0,
        speed: 1.0,
        preserve_pitch: true,
        fade_in: 0,
        fade_out: 0,
        volume_keyframes: Default::default(),
        blend_mode: Default::default(),
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

pub(super) fn insert_source(
    project: &mut Project,
    ids: &mut Ids,
    asset_id: String,
    video_track_id: Option<String>,
    audio_track_id: Option<String>,
    start: i64,
    in_point: i64,
    out_point: i64,
    ripple_all_tracks: bool,
) -> Result<Applied, String> {
    let before = project.clone();
    let result = (|| {
        let targets = source_targets(project, &asset_id, video_track_id, audio_track_id)?;
        validate_source_range(project, &asset_id, in_point, out_point)?;
        let duration = out_point - in_point;
        let mut shifted: HashSet<String> = if ripple_all_tracks {
            project
                .tracks
                .iter()
                .map(|track| track.id.clone())
                .collect()
        } else {
            targets.iter().cloned().collect()
        };
        expand_linked_tracks(project, start, &mut shifted);
        split_for_insert(project, ids, start, &shifted);
        for track in &mut project.tracks {
            if !shifted.contains(&track.id) {
                continue;
            }
            for clip in &mut track.clips {
                if clip.start >= start {
                    clip.start += duration;
                    clip.volume_keyframes.shift_frames(duration);
                }
            }
            for item in &mut track.visual_items {
                if item.start >= start {
                    item.start += duration;
                    item.animation.shift_frames(duration);
                }
            }
            track.sort();
        }
        add_source_clips(
            project, ids, &asset_id, &targets, start, in_point, out_point,
        )?;
        project.validate()?;
        Ok(timeline_applied(&before, project))
    })();
    if result.is_err() {
        *project = before;
    }
    result
}

pub(super) fn overwrite_source(
    project: &mut Project,
    ids: &mut Ids,
    asset_id: String,
    video_track_id: Option<String>,
    audio_track_id: Option<String>,
    start: i64,
    in_point: i64,
    out_point: i64,
) -> Result<Applied, String> {
    let before = project.clone();
    let result = (|| {
        let targets = source_targets(project, &asset_id, video_track_id, audio_track_id)?;
        validate_source_range(project, &asset_id, in_point, out_point)?;
        let end = start
            .checked_add(out_point - in_point)
            .ok_or("that source range is too long")?;
        carve_overwrite(project, ids, &targets, start, end);
        add_source_clips(
            project, ids, &asset_id, &targets, start, in_point, out_point,
        )?;
        project.validate()?;
        Ok(timeline_applied(&before, project))
    })();
    if result.is_err() {
        *project = before;
    }
    result
}

pub(super) fn append_source(
    project: &mut Project,
    ids: &mut Ids,
    asset_id: String,
    video_track_id: Option<String>,
    audio_track_id: Option<String>,
    in_point: i64,
    out_point: i64,
) -> Result<Applied, String> {
    let before = project.clone();
    let result = (|| {
        let targets = source_targets(project, &asset_id, video_track_id, audio_track_id)?;
        validate_source_range(project, &asset_id, in_point, out_point)?;
        let start = project
            .tracks
            .iter()
            .flat_map(|track| {
                let clips = track.clips.iter().map(Clip::end_frame);
                let items = track.visual_items.iter().map(VisualItem::end_frame);
                clips.chain(items)
            })
            .max()
            .unwrap_or(0);
        add_source_clips(
            project, ids, &asset_id, &targets, start, in_point, out_point,
        )?;
        project.validate()?;
        Ok(timeline_applied(&before, project))
    })();
    if result.is_err() {
        *project = before;
    }
    result
}

pub(super) fn source_targets(
    project: &Project,
    asset_id: &str,
    video_track_id: Option<String>,
    audio_track_id: Option<String>,
) -> Result<Vec<String>, String> {
    let asset = project
        .asset(asset_id)
        .ok_or("that source asset is not in this project")?;
    let mut targets = Vec::new();
    for (track_id, kind) in [
        (video_track_id, TrackKind::Video),
        (audio_track_id, TrackKind::Audio),
    ] {
        let Some(track_id) = track_id else {
            continue;
        };
        let track = project
            .track(&track_id)
            .ok_or("that source target track is not on the timeline")?;
        if track.kind != kind || !track.accepts(asset) {
            return Err(format!("{} cannot receive that source", track.name));
        }
        targets.push(track_id);
    }
    if targets.is_empty() {
        return Err("choose video, audio, or both before placing the source".into());
    }
    Ok(targets)
}

pub(super) fn validate_source_range(
    project: &Project,
    asset_id: &str,
    in_point: i64,
    out_point: i64,
) -> Result<(), String> {
    if in_point < 0 || out_point <= in_point {
        return Err("the source out point must be after its in point".into());
    }
    let asset = project
        .asset(asset_id)
        .ok_or("that source asset is not in this project")?;
    if let Some(limit) = asset.source_limit_frames(project.rate()) {
        if out_point > limit {
            return Err("the source range reaches past the end of the file".into());
        }
    }
    Ok(())
}

pub(super) fn add_source_clips(
    project: &mut Project,
    ids: &mut Ids,
    asset_id: &str,
    targets: &[String],
    start: i64,
    in_point: i64,
    out_point: i64,
) -> Result<(), String> {
    if start < 0 {
        return Err("a source cannot start before the timeline does".into());
    }
    let duration = out_point - in_point;
    for track_id in targets {
        let track = project.track(track_id).expect("source target was checked");
        if track.free_start(start, duration, None) != start {
            return Err(format!("{} has no room for that source range", track.name));
        }
    }
    let group = (targets.len() == 2).then(|| ids.make('g'));
    for track_id in targets {
        let clip = Clip {
            id: ids.make('c'),
            asset_id: asset_id.into(),
            link_group: group.clone(),
            lut_path: None,
            start,
            in_point,
            out_point,
            volume: 1.0,
            opacity: 1.0,
            speed: 1.0,
            preserve_pitch: true,
            fade_in: 0,
            fade_out: 0,
            volume_keyframes: Default::default(),
            blend_mode: Default::default(),
        };
        let track = project
            .track_mut(track_id)
            .expect("source target was checked");
        track.clips.push(clip);
        track.sort();
    }
    Ok(())
}

pub(super) fn expand_linked_tracks(project: &Project, from: i64, tracks: &mut HashSet<String>) {
    loop {
        let groups: HashSet<String> = project
            .tracks
            .iter()
            .filter(|track| tracks.contains(&track.id))
            .flat_map(|track| &track.clips)
            .filter(|clip| clip.end_frame() > from)
            .filter_map(|clip| clip.link_group.clone())
            .collect();
        let before = tracks.len();
        for track in &project.tracks {
            if track.clips.iter().any(|clip| {
                clip.link_group
                    .as_ref()
                    .is_some_and(|group| groups.contains(group))
            }) {
                tracks.insert(track.id.clone());
            }
        }
        if tracks.len() == before {
            break;
        }
    }
}

pub(super) fn split_for_insert(
    project: &mut Project,
    ids: &mut Ids,
    at: i64,
    tracks: &HashSet<String>,
) {
    let mut units = Vec::new();
    let mut seen = HashSet::new();
    for track in &project.tracks {
        if !tracks.contains(&track.id) {
            continue;
        }
        for clip in &track.clips {
            if clip.start < at && at < clip.end_frame() {
                let key = clip.link_group.as_deref().unwrap_or(&clip.id).to_string();
                if seen.insert(key) {
                    units.push(clip.id.clone());
                }
            }
        }
    }
    for clip_id in units {
        let placements = project.linked_placements(&clip_id);
        let right_group = (placements.len() == 2).then(|| ids.make('g'));
        let remove: HashSet<String> = placements
            .iter()
            .map(|entry| entry.clip.id.clone())
            .collect();
        for track in &mut project.tracks {
            track.clips.retain(|clip| !remove.contains(&clip.id));
        }
        for entry in placements {
            let mut left = entry.clip.clone();
            let mut right = entry.clip;
            let offset = at - left.start;
            left.out_point = left.in_point + offset;
            right.id = ids.make('c');
            right.link_group = right_group.clone();
            right.start = at;
            right.in_point += offset;
            let track = project
                .track_mut(&entry.track_id)
                .expect("clip placement has a track");
            track.clips.extend([left, right]);
            track.sort();
        }
    }
}

pub(super) fn carve_overwrite(
    project: &mut Project,
    ids: &mut Ids,
    targets: &[String],
    start: i64,
    end: i64,
) {
    let target_set: HashSet<&str> = targets.iter().map(String::as_str).collect();
    let mut units = Vec::new();
    let mut seen = HashSet::new();
    for track in &project.tracks {
        if !target_set.contains(track.id.as_str()) {
            continue;
        }
        for clip in &track.clips {
            if clip.start >= end || clip.end_frame() <= start {
                continue;
            }
            let key = clip.link_group.as_deref().unwrap_or(&clip.id).to_string();
            if seen.insert(key) {
                units.push(clip.id.clone());
            }
        }
    }
    for clip_id in units {
        let mut linked = project.linked_placements(&clip_id);
        if linked
            .iter()
            .any(|entry| !target_set.contains(entry.track_id.as_str()))
        {
            let link_group = linked
                .first()
                .and_then(|entry| entry.clip.link_group.clone());
            if let Some(link_group) = link_group {
                for track in &mut project.tracks {
                    for clip in &mut track.clips {
                        if clip.link_group.as_deref() == Some(&link_group) {
                            clip.link_group = None;
                        }
                    }
                }
                for entry in &mut linked {
                    entry.clip.link_group = None;
                }
            }
        }
        let placements: Vec<_> = linked
            .into_iter()
            .filter(|entry| target_set.contains(entry.track_id.as_str()))
            .collect();
        let remove: HashSet<String> = placements
            .iter()
            .map(|entry| entry.clip.id.clone())
            .collect();
        for track in &mut project.tracks {
            track.clips.retain(|clip| !remove.contains(&clip.id));
        }
        let needs_right = placements
            .first()
            .is_some_and(|entry| entry.clip.start < start && entry.clip.end_frame() > end);
        let right_group = (placements.len() == 2 && needs_right).then(|| ids.make('g'));
        for entry in placements {
            let clip = entry.clip;
            let mut pieces = Vec::new();
            if clip.start < start {
                let mut left = clip.clone();
                left.out_point = left.in_point
                    + ((start - left.start) as f64 * left.speed as f64).round() as i64;
                left.fade_out = 0;
                left.volume_keyframes.retain_frames(left.start, start);
                pieces.push(left);
            }
            if clip.end_frame() > end {
                let mut right = clip.clone();
                if clip.start < start {
                    right.id = ids.make('c');
                    right.link_group = right_group.clone();
                }
                right.in_point += ((end - right.start) as f64 * right.speed as f64).round() as i64;
                right.start = end;
                right.fade_in = 0;
                right.volume_keyframes.retain_frames(end, clip.end_frame());
                pieces.push(right);
            }
            let track = project
                .track_mut(&entry.track_id)
                .expect("clip placement has a track");
            track.clips.extend(pieces);
            track.sort();
        }
    }
}

pub(super) fn timeline_applied(before: &Project, after: &Project) -> Applied {
    let before_clips = clip_entries(before);
    let after_clips = clip_entries(after);
    let before_items = visual_item_entries(before);
    let after_items = visual_item_entries(after);
    Applied {
        resolved: timeline_replace(&before_clips, &after_clips, &before_items, &after_items),
        inverse: timeline_replace(&after_clips, &before_clips, &after_items, &before_items),
    }
}

pub(super) fn clip_entries(project: &Project) -> Vec<ClipAt> {
    project
        .tracks
        .iter()
        .flat_map(|track| {
            track.clips.iter().cloned().map(|clip| ClipAt {
                track_id: track.id.clone(),
                clip,
            })
        })
        .collect()
}

pub(super) fn visual_item_entries(project: &Project) -> Vec<VisualItemAt> {
    project
        .tracks
        .iter()
        .flat_map(|track| {
            track.visual_items.iter().cloned().map(|item| VisualItemAt {
                track_id: track.id.clone(),
                item,
            })
        })
        .collect()
}

pub(super) fn timeline_replace(
    old_clips: &[ClipAt],
    new_clips: &[ClipAt],
    old_items: &[VisualItemAt],
    new_items: &[VisualItemAt],
) -> Command {
    let old_clip_map: HashMap<&str, &ClipAt> = old_clips
        .iter()
        .map(|entry| (entry.clip.id.as_str(), entry))
        .collect();
    let new_clip_map: HashMap<&str, &ClipAt> = new_clips
        .iter()
        .map(|entry| (entry.clip.id.as_str(), entry))
        .collect();
    let old_item_map: HashMap<&str, &VisualItemAt> = old_items
        .iter()
        .map(|entry| (entry.item.id.as_str(), entry))
        .collect();
    let new_item_map: HashMap<&str, &VisualItemAt> = new_items
        .iter()
        .map(|entry| (entry.item.id.as_str(), entry))
        .collect();
    let drop_clips = old_clips
        .iter()
        .filter(|entry| new_clip_map.get(entry.clip.id.as_str()).copied() != Some(*entry))
        .map(|entry| entry.clip.id.clone())
        .collect();
    let restore_clips = new_clips
        .iter()
        .filter(|entry| old_clip_map.get(entry.clip.id.as_str()).copied() != Some(*entry))
        .cloned()
        .collect();
    let drop_items = old_items
        .iter()
        .filter(|entry| new_item_map.get(entry.item.id.as_str()).copied() != Some(*entry))
        .map(|entry| entry.item.id.clone())
        .collect();
    let restore_items = new_items
        .iter()
        .filter(|entry| old_item_map.get(entry.item.id.as_str()).copied() != Some(*entry))
        .cloned()
        .collect();
    Command::Transaction {
        commands: vec![
            Command::DropClips {
                clip_ids: drop_clips,
            },
            Command::RestoreClips {
                entries: restore_clips,
            },
            Command::DropVisualItems {
                item_ids: drop_items,
            },
            Command::RestoreVisualItems {
                entries: restore_items,
            },
        ],
    }
}
