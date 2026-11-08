//! Moving, trimming, splitting, linking and ripple-deleting clips, and transitions.

use super::*;

pub(super) fn move_clip(
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
    let delta = start - clip.start;
    clip.start = start;
    clip.volume_keyframes.shift_frames(delta);
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

pub(super) fn move_linked_clips(
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
        clip.volume_keyframes.shift_frames(*wanted - clip.start);
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

pub(super) fn trim_clip(
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

pub(super) fn trim_one(
    project: &mut Project,
    clip_id: &str,
    edge: Edge,
    frame: i64,
) -> Result<i64, String> {
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
            let available = (clip.in_point as f64 / clip.speed as f64).floor() as i64;
            let earliest = (clip.start - available).max(0).max(previous_end);
            let latest = (clip.end_frame() - shortest).max(earliest);
            let at = frame.clamp(earliest, latest);
            let source_delta = ((at - clip.start) as f64 * clip.speed as f64).round() as i64;
            clip.in_point += source_delta;
            clip.start = at;
            clip.volume_keyframes
                .keyframes
                .retain(|key| key.frame >= at);
            at
        }
        Edge::End => {
            let earliest = clip.start + shortest;
            let source = limit
                .map(|limit| {
                    clip.start + ((limit - clip.in_point) as f64 / clip.speed as f64).floor() as i64
                })
                .unwrap_or(i64::MAX);
            let latest = source.min(next_start).max(earliest);
            let at = frame.clamp(earliest, latest);
            clip.out_point =
                clip.in_point + ((at - clip.start) as f64 * clip.speed as f64).round() as i64;
            clip.volume_keyframes.keyframes.retain(|key| key.frame < at);
            at
        }
    };
    let duration = clip.duration_frames();
    clip.fade_in = clip.fade_in.min(duration);
    clip.fade_out = clip.fade_out.min(duration);
    project.tracks[track_index].sort();
    Ok(at)
}

pub(super) fn split_at(
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
            let source_offset = (offset as f64 * clip.speed as f64).round() as i64;
            let mut right_keyframes = clip.volume_keyframes.clone();
            right_keyframes.keyframes.retain(|key| key.frame >= frame);
            created.push(Clip {
                id: id.clone(),
                asset_id: clip.asset_id.clone(),
                link_group: link_group.clone(),
                lut_path: clip.lut_path.clone(),
                start: frame,
                in_point: clip.in_point + source_offset,
                out_point: clip.out_point,
                volume: clip.volume,
                opacity: clip.opacity,
                speed: clip.speed,
                preserve_pitch: clip.preserve_pitch,
                fade_in: 0,
                fade_out: clip.fade_out,
                volume_keyframes: right_keyframes,
                blend_mode: clip.blend_mode,
            });
            made.push(id);
            made_groups.push(link_group);
            clip.out_point = clip.in_point + source_offset;
            clip.fade_out = 0;
            clip.volume_keyframes
                .keyframes
                .retain(|key| key.frame < frame);
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

pub(super) fn remove_clip(project: &mut Project, clip_id: String) -> Result<Applied, String> {
    let entries = project.linked_placements(&clip_id);
    if entries.is_empty() {
        return Err("that clip is not on the timeline".into());
    }
    let ids: Vec<&str> = entries.iter().map(|entry| entry.clip.id.as_str()).collect();
    let transitions: Vec<TransitionAt> = project
        .transitions
        .iter()
        .enumerate()
        .filter(|(_, transition)| {
            ids.contains(&transition.from_clip_id.as_str())
                || ids.contains(&transition.to_clip_id.as_str())
        })
        .map(|(index, transition)| TransitionAt {
            index,
            transition: transition.clone(),
        })
        .collect();
    let transition_ids: Vec<String> = transitions
        .iter()
        .map(|entry| entry.transition.id.clone())
        .collect();
    for track in &mut project.tracks {
        track.clips.retain(|clip| !ids.contains(&clip.id.as_str()));
    }
    project
        .transitions
        .retain(|transition| !transition_ids.contains(&transition.id));
    Ok(Applied {
        resolved: Command::RemoveClip { clip_id },
        inverse: Command::Transaction {
            commands: vec![
                Command::RestoreClips { entries },
                Command::RestoreTransitions {
                    entries: transitions,
                },
            ],
        },
    })
}

pub(super) fn add_transition(
    project: &mut Project,
    ids: &mut Ids,
    from_clip_id: String,
    to_clip_id: String,
    duration: i64,
    id: Option<String>,
) -> Result<Applied, String> {
    let (track_index, clip_index) = project
        .locate(&from_clip_id)
        .ok_or("the first transition clip is not on the timeline")?;
    let track = &project.tracks[track_index];
    if track.kind != TrackKind::Video
        || track.clips.get(clip_index + 1).map(|clip| clip.id.as_str()) != Some(to_clip_id.as_str())
        || track.clips[clip_index].end_frame() != track.clips[clip_index + 1].start
    {
        return Err("a transition needs touching adjacent video clips".into());
    }
    if project.transitions.iter().any(|transition| {
        transition.from_clip_id == from_clip_id && transition.to_clip_id == to_clip_id
    }) {
        return Err("that clip boundary already has a transition".into());
    }
    let max_duration = track.clips[clip_index]
        .duration_frames()
        .min(track.clips[clip_index + 1].duration_frames());
    if duration <= 0 || duration > max_duration {
        return Err("the transition duration must fit inside both clips".into());
    }
    let id = id.unwrap_or_else(|| ids.make('x'));
    if project.transition(&id).is_some() {
        return Err("that transition already exists".into());
    }
    let transition = Transition {
        id: id.clone(),
        track_id: track.id.clone(),
        from_clip_id: from_clip_id.clone(),
        to_clip_id: to_clip_id.clone(),
        duration,
        kind: TransitionKind::Dissolve,
    };
    project.transitions.push(transition);
    Ok(Applied {
        resolved: Command::AddTransition {
            from_clip_id,
            to_clip_id,
            duration,
            id: Some(id.clone()),
        },
        inverse: Command::DropTransitions {
            transition_ids: vec![id],
        },
    })
}

pub(super) fn set_transition_duration(
    project: &mut Project,
    transition_id: String,
    duration: i64,
) -> Result<Applied, String> {
    let transition_index = project
        .transitions
        .iter()
        .position(|transition| transition.id == transition_id)
        .ok_or("that transition is not on the timeline")?;
    let transition = &project.transitions[transition_index];
    let (track_index, clip_index) = project
        .locate(&transition.from_clip_id)
        .ok_or("the first transition clip is not on the timeline")?;
    let track = &project.tracks[track_index];
    if track.kind != TrackKind::Video
        || track.clips.get(clip_index + 1).map(|clip| clip.id.as_str())
            != Some(transition.to_clip_id.as_str())
        || track.clips[clip_index].end_frame() != track.clips[clip_index + 1].start
    {
        return Err("a transition needs touching adjacent video clips".into());
    }
    let max_duration = track.clips[clip_index]
        .duration_frames()
        .min(track.clips[clip_index + 1].duration_frames());
    if duration <= 0 || duration > max_duration {
        return Err("the transition duration must fit inside both clips".into());
    }
    let previous = transition.duration;
    project.transitions[transition_index].duration = duration;
    Ok(Applied {
        resolved: Command::SetTransitionDuration {
            transition_id: transition_id.clone(),
            duration,
        },
        inverse: Command::SetTransitionDuration {
            transition_id,
            duration: previous,
        },
    })
}

pub(super) fn remove_transition(
    project: &mut Project,
    transition_id: String,
) -> Result<Applied, String> {
    let index = project
        .transitions
        .iter()
        .position(|transition| transition.id == transition_id)
        .ok_or("that transition is not on the timeline")?;
    let transition = project.transitions.remove(index);
    Ok(Applied {
        resolved: Command::RemoveTransition { transition_id },
        inverse: Command::RestoreTransitions {
            entries: vec![TransitionAt { index, transition }],
        },
    })
}

pub(super) fn link_clips(
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

pub(super) fn unlink_clips(project: &mut Project, clip_id: String) -> Result<Applied, String> {
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
pub(super) fn ripple_delete(project: &mut Project, clip_id: String) -> Result<Applied, String> {
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
pub(super) fn ripple_delete_gap(
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

pub(super) fn remove_ranges(
    project: &mut Project,
    ids: &mut Ids,
    ranges: Vec<FrameRange>,
) -> Result<Applied, String> {
    let ranges = normalized_ranges(ranges, project.duration_frames())?;
    if ranges.is_empty() {
        return Ok(Applied {
            resolved: nothing(),
            inverse: nothing(),
        });
    }
    let before = (
        project.tracks.clone(),
        project.transitions.clone(),
        project.markers.clone(),
    );
    for range in ranges.into_iter().rev() {
        remove_range(project, ids, range);
    }
    retain_valid_transitions(project);
    project.validate()?;
    let resolved = Command::RestoreTimeline {
        tracks: project.tracks.clone(),
        transitions: project.transitions.clone(),
        markers: project.markers.clone(),
    };
    Ok(Applied {
        resolved,
        inverse: Command::RestoreTimeline {
            tracks: before.0,
            transitions: before.1,
            markers: before.2,
        },
    })
}

pub(super) fn normalized_ranges(
    mut ranges: Vec<FrameRange>,
    timeline_end: i64,
) -> Result<Vec<FrameRange>, String> {
    if ranges
        .iter()
        .any(|range| range.start < 0 || range.end <= range.start)
    {
        return Err("a removal range must end after its non-negative start".into());
    }
    ranges.sort_by_key(|range| (range.start, range.end));
    let mut merged: Vec<FrameRange> = Vec::new();
    for mut range in ranges {
        range.end = range.end.min(timeline_end);
        if range.end <= range.start {
            continue;
        }
        if let Some(previous) = merged.last_mut() {
            if range.start <= previous.end {
                previous.end = previous.end.max(range.end);
                continue;
            }
        }
        merged.push(range);
    }
    Ok(merged)
}

pub(super) fn remove_range(project: &mut Project, ids: &mut Ids, range: FrameRange) {
    let track_ids = project
        .tracks
        .iter()
        .map(|track| track.id.clone())
        .collect::<Vec<_>>();
    carve_overwrite(project, ids, &track_ids, range.start, range.end);
    let amount = range.end - range.start;
    for track in &mut project.tracks {
        for clip in &mut track.clips {
            if clip.start >= range.end {
                clip.start -= amount;
                clip.volume_keyframes.shift_frames(-amount);
            }
        }
        track.sort();
        remove_visual_range(&mut track.visual_items, ids, range);
    }
    for marker in &mut project.markers {
        marker.frame = if marker.frame >= range.end {
            marker.frame - amount
        } else if marker.frame > range.start {
            range.start
        } else {
            marker.frame
        };
    }
    project.markers.sort_by_key(|marker| marker.frame);
}

pub(super) fn remove_visual_range(items: &mut Vec<VisualItem>, ids: &mut Ids, range: FrameRange) {
    let amount = range.end - range.start;
    let mut kept = Vec::with_capacity(items.len());
    for mut item in std::mem::take(items) {
        let original_start = item.start;
        let original_end = item.end_frame();
        if original_end <= range.start {
            kept.push(item);
            continue;
        }
        if original_start >= range.end {
            item.start -= amount;
            item.animation.shift_frames(-amount);
            kept.push(item);
            continue;
        }
        if original_start >= range.start && original_end <= range.end {
            continue;
        }
        if original_start < range.start && original_end > range.end {
            let mut right = item.clone();
            item.duration = range.start - original_start;
            item.animation.retain_frames(original_start, range.start);
            right.id = ids.make('v');
            right.start = range.start;
            right.duration = original_end - range.end;
            right.animation.retain_frames(range.end, original_end);
            right.animation.shift_frames(-amount);
            advance_overlay_source(&mut right.content, range.end - original_start);
            kept.extend([item, right]);
            continue;
        }
        if original_start < range.start {
            item.duration = range.start - original_start;
            item.animation.retain_frames(original_start, range.start);
            kept.push(item);
            continue;
        }
        let removed_head = range.end - original_start;
        item.start = range.start;
        item.duration = original_end - range.end;
        item.animation.retain_frames(range.end, original_end);
        item.animation.shift_frames(-amount);
        advance_overlay_source(&mut item.content, removed_head);
        kept.push(item);
    }
    kept.sort_by_key(|item| (item.start, item.z_index));
    *items = kept;
}

pub(super) fn advance_overlay_source(content: &mut VisualContent, frames: i64) {
    if let VisualContent::VideoOverlay { in_point, .. } = content {
        *in_point = in_point.saturating_add(frames);
    }
}

pub(super) fn retain_valid_transitions(project: &mut Project) {
    let valid = project
        .transitions
        .iter()
        .filter_map(|transition| {
            let track = project.track(&transition.track_id)?;
            let index = track
                .clips
                .iter()
                .position(|clip| clip.id == transition.from_clip_id)?;
            let from = &track.clips[index];
            let to = track.clips.get(index + 1)?;
            (to.id == transition.to_clip_id
                && from.end_frame() == to.start
                && transition.duration <= from.duration_frames()
                && transition.duration <= to.duration_frames())
            .then(|| transition.id.clone())
        })
        .collect::<HashSet<_>>();
    project
        .transitions
        .retain(|transition| valid.contains(&transition.id));
}

pub(super) fn shift_clips_left(project: &mut Project, moved_ids: &HashSet<String>, amount: i64) {
    for track in &mut project.tracks {
        for clip in &mut track.clips {
            if moved_ids.contains(&clip.id) {
                clip.start -= amount;
                clip.volume_keyframes.shift_frames(-amount);
            }
        }
        track.sort();
    }
}
