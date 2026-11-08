//! Queries and mutations on a whole project.

use super::*;

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
                    subtitle_style: None,
                    muted: false,
                    hidden: false,
                },
                Track {
                    id: "t2".into(),
                    kind: TrackKind::Audio,
                    name: "A1".into(),
                    clips: Vec::new(),
                    visual_items: Vec::new(),
                    subtitle_style: None,
                    muted: false,
                    hidden: false,
                },
            ],
            transitions: Vec::new(),
            markers: Vec::new(),
        }
    }

    pub fn asset(&self, id: &str) -> Option<&Asset> {
        self.assets.iter().find(|asset| asset.id == id)
    }

    pub fn asset_index(&self, id: &str) -> Option<usize> {
        self.assets.iter().position(|asset| asset.id == id)
    }

    pub fn uses_video_paint(&self) -> bool {
        !self.transitions.is_empty()
            || self
                .tracks
                .iter()
                .filter(|track| track.contributes())
                .any(|track| {
                    track.clips.iter().any(|clip| {
                        (clip.speed - 1.0).abs() > f32::EPSILON
                            || clip.blend_mode != BlendMode::Normal
                    }) || track.visual_items.iter().any(|item| {
                        item.content.uses_video_paint()
                            || item.blend_mode != BlendMode::Normal
                            || item.animation != VisualAnimation::default()
                    })
                })
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

    pub fn transition(&self, transition_id: &str) -> Option<&Transition> {
        self.transitions
            .iter()
            .find(|transition| transition.id == transition_id)
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
            if !matches!(track.kind, TrackKind::Video | TrackKind::Subtitle) || track.hidden {
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

    pub fn marker(&self, marker_id: &str) -> Option<&Marker> {
        self.markers.iter().find(|marker| marker.id == marker_id)
    }

    pub fn duration(&self) -> RationalTime {
        RationalTime::new(self.duration_frames(), self.rate())
    }

    /// How far into its source a clip may reach, when anything knows.
    pub(super) fn source_limit(&self, clip: &Clip) -> Option<i64> {
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
        let mut marker_ids = HashSet::new();
        for marker in &self.markers {
            if marker.frame < 0 {
                return Err(format!(
                    "marker {} would start before the timeline does",
                    marker.id
                ));
            }
            if marker.color.trim().is_empty() {
                return Err(format!("marker {} has no color", marker.id));
            }
            if !marker_ids.insert(marker.id.as_str()) {
                return Err(format!("marker {} is duplicated", marker.id));
            }
        }
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
                if !clip.speed.is_finite() || !(0.1..=16.0).contains(&clip.speed) {
                    return Err(format!("clip {name} has an invalid speed"));
                }
                if clip.fade_in < 0
                    || clip.fade_out < 0
                    || clip.fade_in > clip.duration_frames()
                    || clip.fade_out > clip.duration_frames()
                {
                    return Err(format!("clip {name} has an invalid audio fade"));
                }
                if !clip.volume_keyframes.is_valid(
                    clip.start,
                    clip.end_frame().saturating_sub(1),
                    0.0,
                    1.0,
                ) {
                    return Err(format!("clip {name} has invalid volume keyframes"));
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
                return Err("visual items do not belong on audio tracks".into());
            }
            if track.kind == TrackKind::Subtitle
                && track
                    .visual_items
                    .iter()
                    .any(|item| !matches!(item.content, VisualContent::Text { .. }))
            {
                return Err("subtitle tracks only hold text".into());
            }
            if track.kind == TrackKind::Subtitle {
                let mut items = track.visual_items.iter().collect::<Vec<_>>();
                items.sort_by_key(|item| item.start);
                for pair in items.windows(2) {
                    if pair[0].end_frame() > pair[1].start {
                        return Err("subtitle items cannot overlap".into());
                    }
                }
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
                if let VisualContent::VideoOverlay {
                    asset_id,
                    in_point,
                    crop,
                    corner_radius,
                    border,
                    ..
                } = &item.content
                {
                    let asset = self
                        .asset(asset_id)
                        .ok_or_else(|| format!("visual item {name} references a missing asset"))?;
                    if asset.kind != AssetKind::Video {
                        return Err(format!("visual item {name} needs a video asset"));
                    }
                    if *in_point < 0
                        || asset
                            .source_limit_frames(self.rate())
                            .is_some_and(|limit| in_point.saturating_add(item.duration) > limit)
                    {
                        return Err(format!("visual item {name} reaches past its video source"));
                    }
                    if !crop.is_valid() {
                        return Err(format!("visual item {name} has an invalid crop"));
                    }
                    if !corner_radius.is_finite() || *corner_radius < 0.0 {
                        return Err(format!("visual item {name} has an invalid corner radius"));
                    }
                    if border.as_ref().is_some_and(|stroke| {
                        !stroke.width.is_finite() || stroke.width < 0.0 || stroke.color.is_empty()
                    }) {
                        return Err(format!("visual item {name} has an invalid border"));
                    }
                }
                let last_frame = item.end_frame().saturating_sub(1);
                let unbounded = -f32::MAX..=f32::MAX;
                for track in [
                    &item.animation.x,
                    &item.animation.y,
                    &item.animation.rotation,
                ] {
                    if !track.is_valid(item.start, last_frame, *unbounded.start(), *unbounded.end())
                    {
                        return Err(format!("visual item {name} has invalid keyframes"));
                    }
                }
                for track in [&item.animation.width, &item.animation.height] {
                    if !track.is_valid(item.start, last_frame, 1.0, f32::MAX) {
                        return Err(format!("visual item {name} has invalid size keyframes"));
                    }
                }
                if !item
                    .animation
                    .opacity
                    .is_valid(item.start, last_frame, 0.0, 1.0)
                {
                    return Err(format!("visual item {name} has invalid opacity keyframes"));
                }
                let style = match &item.content {
                    VisualContent::Text { style, .. } => Some(&style.visual_style),
                    VisualContent::Shape { visual_style, .. } => Some(visual_style),
                    VisualContent::Image { .. }
                    | VisualContent::VideoOverlay { .. }
                    | VisualContent::Adjustment { .. } => None,
                };
                if let Some(error) = style.and_then(|style| style.validate().err()) {
                    return Err(format!("visual item {name} {error}"));
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
        let mut transition_ids = HashSet::new();
        for transition in &self.transitions {
            if !transition_ids.insert(transition.id.as_str()) {
                return Err(format!("transition {} is duplicated", transition.id));
            }
            let track = self.track(&transition.track_id).ok_or_else(|| {
                format!("transition {} references a missing track", transition.id)
            })?;
            if track.kind != TrackKind::Video {
                return Err(format!("transition {} needs a video track", transition.id));
            }
            let Some(index) = track
                .clips
                .iter()
                .position(|clip| clip.id == transition.from_clip_id)
            else {
                return Err(format!(
                    "transition {} references a missing clip",
                    transition.id
                ));
            };
            let Some(next) = track.clips.get(index + 1) else {
                return Err(format!("transition {} needs adjacent clips", transition.id));
            };
            let from = &track.clips[index];
            if next.id != transition.to_clip_id || from.end_frame() != next.start {
                return Err(format!(
                    "transition {} needs touching adjacent clips",
                    transition.id
                ));
            }
            if transition.duration <= 0
                || transition.duration > from.duration_frames()
                || transition.duration > next.duration_frames()
            {
                return Err(format!(
                    "transition {} has an invalid duration",
                    transition.id
                ));
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
        self.markers.retain(|marker| !marker.id.is_empty());
        for marker in &mut self.markers {
            marker.frame = marker.frame.max(0);
            if marker.color.trim().is_empty() {
                marker.color = default_marker_color();
            }
        }
        self.markers.sort_by(|left, right| {
            left.frame
                .cmp(&right.frame)
                .then_with(|| left.id.cmp(&right.id))
        });
        let mut marker_ids = HashSet::new();
        self.markers
            .retain(|marker| marker_ids.insert(marker.id.clone()));
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
                clip.speed = finite_or(clip.speed, 1.0).clamp(0.1, 16.0);
                let duration = clip.duration_frames();
                clip.fade_in = clip.fade_in.clamp(0, duration);
                clip.fade_out = clip.fade_out.clamp(0, duration);
                clip.volume_keyframes.repair(
                    clip.start,
                    clip.end_frame().saturating_sub(1),
                    0.0,
                    1.0,
                );
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
                    let last_frame = item.end_frame().saturating_sub(1);
                    item.animation
                        .x
                        .repair(item.start, last_frame, -f32::MAX, f32::MAX);
                    item.animation
                        .y
                        .repair(item.start, last_frame, -f32::MAX, f32::MAX);
                    item.animation
                        .rotation
                        .repair(item.start, last_frame, -f32::MAX, f32::MAX);
                    item.animation
                        .width
                        .repair(item.start, last_frame, 1.0, f32::MAX);
                    item.animation
                        .height
                        .repair(item.start, last_frame, 1.0, f32::MAX);
                    item.animation
                        .opacity
                        .repair(item.start, last_frame, 0.0, 1.0);
                }
            }
        }
        let transitions = std::mem::take(&mut self.transitions);
        let mut transition_ids = HashSet::new();
        self.transitions = transitions
            .into_iter()
            .filter(|transition| {
                if !transition_ids.insert(transition.id.clone()) {
                    return false;
                }
                let Some(track) = self.track(&transition.track_id) else {
                    return false;
                };
                let Some(index) = track
                    .clips
                    .iter()
                    .position(|clip| clip.id == transition.from_clip_id)
                else {
                    return false;
                };
                let Some(next) = track.clips.get(index + 1) else {
                    return false;
                };
                next.id == transition.to_clip_id
                    && track.clips[index].end_frame() == next.start
                    && transition.duration > 0
                    && transition.duration <= track.clips[index].duration_frames()
                    && transition.duration <= next.duration_frames()
            })
            .collect();
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
