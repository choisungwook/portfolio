//! Per-clip and per-visual settings, project settings, and markers.

use super::*;

pub(super) fn set_clip_gain(
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

pub(super) fn set_clip_denoise(
    project: &mut Project,
    clip_id: String,
    strength: f32,
) -> Result<Applied, String> {
    if !strength.is_finite() {
        return Err("noise reduction strength must be a number".into());
    }
    let (track_index, clip_index) = project
        .locate(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let clip = &mut project.tracks[track_index].clips[clip_index];
    let previous = clip.denoise;
    clip.denoise = strength.clamp(0.0, 1.0);
    Ok(Applied {
        resolved: Command::SetClipDenoise {
            clip_id: clip_id.clone(),
            strength: clip.denoise,
        },
        inverse: Command::SetClipDenoise {
            clip_id,
            strength: previous,
        },
    })
}

pub(super) fn set_clip_lut(
    project: &mut Project,
    clip_id: String,
    lut_path: Option<String>,
) -> Result<Applied, String> {
    let (track_index, clip_index) = project
        .locate(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let clip = &mut project.tracks[track_index].clips[clip_index];
    let previous = clip.lut_path.clone();
    clip.lut_path = lut_path.clone();
    Ok(Applied {
        resolved: Command::SetClipLut {
            clip_id: clip_id.clone(),
            lut_path,
        },
        inverse: Command::SetClipLut {
            clip_id,
            lut_path: previous,
        },
    })
}

pub(super) fn set_clip_playback(
    project: &mut Project,
    clip_id: String,
    speed: Option<f32>,
    preserve_pitch: Option<bool>,
    fade_in: Option<i64>,
    fade_out: Option<i64>,
) -> Result<Applied, String> {
    let entries = project.linked_placements(&clip_id);
    if entries.is_empty() {
        return Err("that clip is not on the timeline".into());
    }
    if let Some(value) = speed {
        if !value.is_finite() || !(0.1..=16.0).contains(&value) {
            return Err("clip speed must be between 0.1 and 16".into());
        }
        for entry in &entries {
            let mut candidate = entry.clip.clone();
            candidate.speed = value;
            let track = project
                .track(&entry.track_id)
                .expect("a linked placement has a track");
            if track.free_start(
                candidate.start,
                candidate.duration_frames(),
                Some(&candidate.id),
            ) != candidate.start
            {
                return Err(format!(
                    "{} has no room for that playback speed",
                    track.name
                ));
            }
        }
    }
    let previous = entries.clone();
    let ids: HashSet<String> = entries.into_iter().map(|entry| entry.clip.id).collect();
    for track in &mut project.tracks {
        for clip in &mut track.clips {
            if !ids.contains(&clip.id) {
                continue;
            }
            if let Some(value) = speed {
                clip.speed = value;
            }
            if let Some(value) = preserve_pitch {
                clip.preserve_pitch = value;
            }
            if let Some(value) = fade_in {
                clip.fade_in = value.max(0);
            }
            if let Some(value) = fade_out {
                clip.fade_out = value.max(0);
            }
            let duration = clip.duration_frames();
            clip.fade_in = clip.fade_in.min(duration);
            clip.fade_out = clip.fade_out.min(duration);
            clip.volume_keyframes
                .retain_frames(clip.start, clip.end_frame());
        }
        track.sort();
    }
    Ok(Applied {
        resolved: Command::SetClipPlayback {
            clip_id,
            speed,
            preserve_pitch,
            fade_in,
            fade_out,
        },
        inverse: Command::RestoreClips { entries: previous },
    })
}

pub(super) fn set_clip_volume_keyframe(
    project: &mut Project,
    clip_id: String,
    frame: i64,
    value: f32,
    easing: Easing,
) -> Result<Applied, String> {
    let (track, index) = project
        .locate(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let clip = &mut project.tracks[track].clips[index];
    if frame < clip.start || frame >= clip.end_frame() {
        return Err("a volume keyframe must be inside its clip".into());
    }
    if !value.is_finite() {
        return Err("a volume keyframe needs a finite value".into());
    }
    let previous = clip.volume_keyframes.set(Keyframe {
        frame,
        value: value.clamp(0.0, 1.0),
        easing,
    });
    let inverse = previous.map_or_else(
        || Command::RemoveClipVolumeKeyframe {
            clip_id: clip_id.clone(),
            frame,
        },
        |key| Command::SetClipVolumeKeyframe {
            clip_id: clip_id.clone(),
            frame: key.frame,
            value: key.value,
            easing: key.easing,
        },
    );
    Ok(Applied {
        resolved: Command::SetClipVolumeKeyframe {
            clip_id,
            frame,
            value: value.clamp(0.0, 1.0),
            easing,
        },
        inverse,
    })
}

pub(super) fn remove_clip_volume_keyframe(
    project: &mut Project,
    clip_id: String,
    frame: i64,
) -> Result<Applied, String> {
    let (track, index) = project
        .locate(&clip_id)
        .ok_or("that clip is not on the timeline")?;
    let removed = project.tracks[track].clips[index]
        .volume_keyframes
        .remove(frame)
        .ok_or("there is no volume keyframe at that frame")?;
    Ok(Applied {
        resolved: Command::RemoveClipVolumeKeyframe {
            clip_id: clip_id.clone(),
            frame,
        },
        inverse: Command::SetClipVolumeKeyframe {
            clip_id,
            frame,
            value: removed.value,
            easing: removed.easing,
        },
    })
}

pub(super) fn set_layer_blend_mode(
    project: &mut Project,
    layer_id: String,
    blend_mode: BlendMode,
) -> Result<Applied, String> {
    if let Some((track, clip)) = project.locate(&layer_id) {
        let previous = project.tracks[track].clips[clip].blend_mode;
        project.tracks[track].clips[clip].blend_mode = blend_mode;
        return Ok(Applied {
            resolved: Command::SetLayerBlendMode {
                layer_id: layer_id.clone(),
                blend_mode,
            },
            inverse: Command::SetLayerBlendMode {
                layer_id,
                blend_mode: previous,
            },
        });
    }
    let (track, item) = project
        .locate_visual_item(&layer_id)
        .ok_or("that layer is not on the timeline")?;
    let previous = project.tracks[track].visual_items[item].blend_mode;
    project.tracks[track].visual_items[item].blend_mode = blend_mode;
    Ok(Applied {
        resolved: Command::SetLayerBlendMode {
            layer_id: layer_id.clone(),
            blend_mode,
        },
        inverse: Command::SetLayerBlendMode {
            layer_id,
            blend_mode: previous,
        },
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn add_visual_item(
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
    if !matches!(
        project.tracks[track_index].kind,
        TrackKind::Video | TrackKind::Subtitle
    ) {
        return Err("visual items do not belong on audio tracks".into());
    }
    if project.tracks[track_index].kind == TrackKind::Subtitle
        && !matches!(content, VisualContent::Text { .. })
    {
        return Err("subtitle tracks only hold text".into());
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
        animation: Default::default(),
        blend_mode: Default::default(),
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

#[allow(clippy::too_many_arguments)]
pub(super) fn add_overlay_visual_item(
    project: &mut Project,
    ids: &mut Ids,
    content: VisualContent,
    start: i64,
    duration: i64,
    transform: VisualTransform,
    z_index: i32,
    id: Option<String>,
) -> Result<Applied, String> {
    if !matches!(
        content,
        VisualContent::Text { .. } | VisualContent::Shape { .. }
    ) {
        return Err("only text and shapes use an overlay track".into());
    }
    let videos: Vec<_> = project
        .tracks
        .iter()
        .filter(|track| track.kind == TrackKind::Video)
        .collect();
    let reusable = videos.last().filter(|track| {
        track.clips.is_empty()
            && track.visual_items.iter().all(|item| {
                matches!(
                    item.content,
                    VisualContent::Text { .. } | VisualContent::Shape { .. }
                )
            })
    });
    if let Some(track) = reusable {
        return add_visual_item(
            project,
            ids,
            track.id.clone(),
            content,
            start,
            duration,
            transform,
            z_index,
            id,
        );
    }
    if videos.len() >= crate::MAX_TRACKS_PER_KIND {
        let track_id = videos
            .last()
            .map(|track| track.id.clone())
            .ok_or("there is no video track for that visual item")?;
        return add_visual_item(
            project, ids, track_id, content, start, duration, transform, z_index, id,
        );
    }

    let track_id = ids.make('t');
    transaction(
        project,
        ids,
        vec![
            Command::AddTrack {
                track_kind: TrackKind::Video,
                id: Some(track_id.clone()),
            },
            Command::AddVisualItem {
                track_id,
                content,
                start,
                duration,
                transform,
                z_index,
                id,
            },
        ],
    )
}

pub(super) fn set_visual_transform(
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

pub(super) fn set_visual_keyframe(
    project: &mut Project,
    item_id: String,
    property: VisualProperty,
    frame: i64,
    value: f32,
    easing: Easing,
) -> Result<Applied, String> {
    let (track, index) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let item = &mut project.tracks[track].visual_items[index];
    if frame < item.start || frame >= item.end_frame() {
        return Err("a visual keyframe must be inside its item".into());
    }
    if !value.is_finite() {
        return Err("a visual keyframe needs a finite value".into());
    }
    let value = match property {
        VisualProperty::Width | VisualProperty::Height => value.max(1.0),
        VisualProperty::Opacity => value.clamp(0.0, 1.0),
        _ => value,
    };
    let previous = item.animation.track_mut(property).set(Keyframe {
        frame,
        value,
        easing,
    });
    let inverse = previous.map_or_else(
        || Command::RemoveVisualKeyframe {
            item_id: item_id.clone(),
            property,
            frame,
        },
        |key| Command::SetVisualKeyframe {
            item_id: item_id.clone(),
            property,
            frame: key.frame,
            value: key.value,
            easing: key.easing,
        },
    );
    Ok(Applied {
        resolved: Command::SetVisualKeyframe {
            item_id,
            property,
            frame,
            value,
            easing,
        },
        inverse,
    })
}

pub(super) fn remove_visual_keyframe(
    project: &mut Project,
    item_id: String,
    property: VisualProperty,
    frame: i64,
) -> Result<Applied, String> {
    let (track, index) = project
        .locate_visual_item(&item_id)
        .ok_or("that visual item is not on the timeline")?;
    let removed = project.tracks[track].visual_items[index]
        .animation
        .track_mut(property)
        .remove(frame)
        .ok_or("there is no visual keyframe at that frame")?;
    Ok(Applied {
        resolved: Command::RemoveVisualKeyframe {
            item_id: item_id.clone(),
            property,
            frame,
        },
        inverse: Command::SetVisualKeyframe {
            item_id,
            property,
            frame,
            value: removed.value,
            easing: removed.easing,
        },
    })
}

pub(super) fn set_visual_timing(
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
    item.animation.shift_frames(start - item.start);
    item.start = start;
    item.duration = duration;
    item.animation.retain_frames(start, item.end_frame());
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

pub(super) fn set_visual_z_index(
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

pub(super) fn set_visual_content(
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

pub(super) fn validate_visual_content(
    project: &Project,
    content: &VisualContent,
) -> Result<(), String> {
    if let Some(asset_id) = content.asset_id() {
        let asset = project
            .asset(asset_id)
            .ok_or("that visual item asset is not in this project")?;
        match (content, asset.kind) {
            (VisualContent::Image { .. }, crate::AssetKind::Image)
            | (VisualContent::VideoOverlay { .. }, crate::AssetKind::Video)
            | (VisualContent::Text { .. } | VisualContent::Shape { .. }, _) => {}
            (VisualContent::Image { .. }, _) => {
                return Err("an image item needs an image asset".into())
            }
            (VisualContent::VideoOverlay { .. }, _) => {
                return Err("a video overlay needs a video asset".into())
            }
            (VisualContent::Adjustment { .. }, _) => {}
        }
    }
    let style = match content {
        VisualContent::Text { style, .. } => Some(&style.visual_style),
        VisualContent::Shape { visual_style, .. } => Some(visual_style),
        VisualContent::Image { .. }
        | VisualContent::VideoOverlay { .. }
        | VisualContent::Adjustment { .. } => None,
    };
    if let Some(style) = style {
        style.validate().map_err(str::to_string)?;
    }
    for paint in style.into_iter().flat_map(|style| &style.fills) {
        let Some(asset_id) = paint.asset_id() else {
            continue;
        };
        let asset = project
            .asset(asset_id)
            .ok_or("that paint asset is not in this project")?;
        match (paint, asset.kind) {
            (crate::Paint::Image { .. }, crate::AssetKind::Image)
            | (crate::Paint::Video { .. }, crate::AssetKind::Video) => {}
            (crate::Paint::Image { .. }, _) => {
                return Err("an image paint needs an image asset".into())
            }
            (crate::Paint::Video { .. }, _) => {
                return Err("a video paint needs a video asset".into())
            }
            _ => {}
        }
    }
    Ok(())
}

pub(super) fn remove_visual_item(
    project: &mut Project,
    item_id: String,
) -> Result<Applied, String> {
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
pub(super) fn set_settings(project: &mut Project, settings: ProjectSettings) -> Applied {
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
    let restore_transitions: Vec<TransitionAt> = project
        .transitions
        .iter()
        .enumerate()
        .map(|(index, transition)| TransitionAt {
            index,
            transition: transition.clone(),
        })
        .collect();
    for transition in &mut project.transitions {
        transition.duration = rescale(transition.duration, from, to).max(1);
    }
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
            clip.fade_in = rescale(clip.fade_in, from, to).max(0);
            clip.fade_out = rescale(clip.fade_out, from, to).max(0);
            clip.volume_keyframes
                .map_frames(|frame| rescale(frame, from, to));
            let duration = clip.duration_frames();
            clip.fade_in = clip.fade_in.min(duration);
            clip.fade_out = clip.fade_out.min(duration);
            clip.volume_keyframes
                .retain_frames(clip.start, clip.end_frame());
        }
        for item in &mut track.visual_items {
            restore_items.push(VisualItemAt {
                track_id: track.id.clone(),
                item: item.clone(),
            });
            item.start = rescale(item.start, from, to);
            item.duration = rescale(item.duration, from, to).max(1);
            item.animation.map_frames(|frame| rescale(frame, from, to));
            item.animation.retain_frames(item.start, item.end_frame());
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
                Command::RestoreTransitions {
                    entries: restore_transitions,
                },
            ],
        },
    }
}

pub(super) fn rescale(value: i64, from: Rate, to: Rate) -> i64 {
    crate::RationalTime::new(value, from).rescaled(to).value()
}

pub(super) fn add_marker(
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

pub(super) fn set_marker(
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

pub(super) fn remove_marker(project: &mut Project, marker_id: String) -> Result<Applied, String> {
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
