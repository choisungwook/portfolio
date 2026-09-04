//! Where every clip lands in the output frame.
//!
//! This is the one place that answers "what is on screen at frame N, and
//! where". Before it existed the answer was given twice — as CSS object-fit in
//! the preview and as scale plus pad in the ffmpeg filter graph — and two
//! implementations of the same arithmetic drift. Both the compositor and the
//! decoder command now read their geometry from here.
//!
//! Everything is in output pixels and integers, and every time is a frame
//! index on the project rate. Floats would let the two callers round
//! differently, which is exactly the divergence this removes.

use crate::{
    Asset, AssetKind, BlendMode, Clip, KeyframeTrack, Project, Rate, RationalTime, Track, TrackKind,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Everything about one clip that does not change while it is on screen. The
/// render reads this once per clip to start a decoder; the preview reads it
/// every frame through `layers_at`. One list, so the two cannot disagree.
#[derive(Debug, Clone, PartialEq)]
pub struct Placement {
    pub clip_id: String,
    pub asset_id: String,
    pub path: String,
    pub kind: AssetKind,
    /// Where the clip sits on the timeline, and how long it lasts, in frames.
    pub start_frame: i64,
    pub duration_frames: i64,
    /// Where it starts inside the source, in frames of the project rate.
    pub in_frame: i64,
    pub dst: Rect,
    pub opacity: f32,
    pub speed: f32,
    pub blend_mode: BlendMode,
}

impl Placement {
    pub fn end_frame(&self) -> i64 {
        self.start_frame + self.duration_frames
    }

    pub fn covers(&self, frame: i64) -> bool {
        frame >= self.start_frame && frame < self.end_frame()
    }

    /// Where to seek the source, as a time rather than a frame index, because
    /// that is what ffmpeg's `-ss` takes.
    pub fn in_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.in_frame, rate)
    }

    pub fn duration(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.duration_frames, rate)
    }
}

/// Everything about one clip's sound that does not change while it plays.
///
/// The audio counterpart of `Placement`, and it exists for the same reason: the
/// render mixes with `amix` and playback mixes in Rust, and the two have to
/// agree on which clips are audible and where they sit. Times are frames of the
/// project rate here; the sample offsets both sides use come from
/// `RationalTime::to_samples`, so neither of them does the arithmetic twice.
#[derive(Debug, Clone, PartialEq)]
pub struct AudioPlacement {
    pub clip_id: String,
    pub asset_id: String,
    pub path: String,
    pub kind: AssetKind,
    pub start_frame: i64,
    pub duration_frames: i64,
    /// Where it starts inside the source, in frames of the project rate.
    pub in_frame: i64,
    pub volume: f32,
    pub volume_keyframes: KeyframeTrack,
    pub fade_in: i64,
    pub fade_out: i64,
    pub speed: f32,
    pub preserve_pitch: bool,
}

impl AudioPlacement {
    pub fn end_frame(&self) -> i64 {
        self.start_frame + self.duration_frames
    }

    pub fn covers(&self, frame: i64) -> bool {
        frame >= self.start_frame && frame < self.end_frame()
    }

    pub fn in_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.in_frame, rate)
    }

    pub fn duration(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.duration_frames, rate)
    }

    pub fn volume_at(&self, frame: i64) -> f32 {
        let mut volume = self
            .volume_keyframes
            .value_at(frame, self.volume)
            .clamp(0.0, 1.0);
        let offset = frame.saturating_sub(self.start_frame);
        if self.fade_in > 0 {
            volume *= (offset as f32 / self.fade_in as f32).clamp(0.0, 1.0);
        }
        let remaining = self.end_frame().saturating_sub(frame + 1);
        if self.fade_out > 0 {
            volume *= (remaining as f32 / self.fade_out as f32).clamp(0.0, 1.0);
        }
        volume
    }
}

/// Whether this asset on this track puts sound into the output.
///
/// Written once because it is a rule with three parts and two callers. A hidden
/// track is out whatever kind it is — hiding a video track to see what is under
/// it silences it too. A muted track is out whichever kind it is, which for a
/// video track means the picture stays and the sound goes. And an asset with no
/// sound track contributes nothing to mix in the first place; a still never
/// does.
pub fn carries_sound(asset: &Asset, track: &Track) -> bool {
    if track.hidden || track.muted {
        return false;
    }
    match asset.kind {
        AssetKind::Audio => true,
        AssetKind::Video => asset.has_audio,
        AssetKind::Image => false,
    }
}

/// A linked video/audio pair has one source stream but two timeline clips.
/// The audio-track clip is the mix source; keeping the video-track clip in the
/// mix too would make the same samples play twice.
pub fn linked_audio_track_has_group(project: &Project, clip: &Clip) -> bool {
    let Some(group) = clip.link_group.as_deref() else {
        return false;
    };
    project.tracks.iter().any(|track| {
        track.kind == TrackKind::Audio
            && track
                .clips
                .iter()
                .any(|candidate| candidate.link_group.as_deref() == Some(group))
    })
}

pub fn clip_carries_sound(project: &Project, asset: &Asset, track: &Track, clip: &Clip) -> bool {
    carries_sound(asset, track)
        && !(track.kind == TrackKind::Video && linked_audio_track_has_group(project, clip))
}

/// Every clip that is audible, video tracks first and then audio tracks, each
/// in track order. The order does not change a sum, but keeping it the same as
/// the render's input order means a report from either side lists the clips the
/// same way.
pub fn audio_placements(project: &Project) -> Vec<AudioPlacement> {
    let mut placements = Vec::new();
    for kind in [TrackKind::Video, TrackKind::Audio] {
        for track in project.tracks.iter().filter(|track| track.kind == kind) {
            let mut clips: Vec<_> = track
                .clips
                .iter()
                .filter(|clip| clip.duration_frames() > 0)
                .collect();
            clips.sort_by_key(|clip| clip.start);
            for clip in clips {
                let Some(asset) = project.asset(&clip.asset_id) else {
                    continue;
                };
                if !clip_carries_sound(project, asset, track, clip) {
                    continue;
                }
                placements.push(AudioPlacement {
                    clip_id: clip.id.clone(),
                    asset_id: asset.id.clone(),
                    path: asset.path.clone(),
                    kind: asset.kind,
                    start_frame: clip.start,
                    duration_frames: clip.duration_frames(),
                    in_frame: clip.in_point,
                    volume: clip.volume.max(0.0),
                    volume_keyframes: clip.volume_keyframes.clone(),
                    fade_in: clip.fade_in,
                    fade_out: clip.fade_out,
                    speed: clip.speed,
                    preserve_pitch: clip.preserve_pitch,
                });
            }
        }
    }
    placements
}

/// One thing to draw for one frame, bottom layer first.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
    pub clip_id: String,
    pub asset_id: String,
    pub path: String,
    pub kind: AssetKind,
    /// Which frame of the source this instant is.
    pub source_frame: i64,
    pub dst: Rect,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl Layer {
    pub fn source_time(&self, rate: Rate) -> RationalTime {
        RationalTime::new(self.source_frame, rate)
    }
}

/// Scalers want even dimensions, and so does h264.
fn even(value: f64) -> u32 {
    let rounded = value.round().max(2.0) as u32;
    rounded - (rounded % 2)
}

/// Fit a source into the frame without cropping it, centred. This is the whole
/// of "object-fit: contain" and of "scale=force_original_aspect_ratio=decrease
/// then pad", written once.
///
/// A source of unknown size — an asset imported with no ffprobe to measure it —
/// fills the frame, because guessing an aspect ratio would be worse than
/// showing everything.
pub fn fit_rect(source_width: u32, source_height: u32, out_width: u32, out_height: u32) -> Rect {
    if source_width == 0 || source_height == 0 {
        return Rect {
            x: 0,
            y: 0,
            w: even(out_width as f64),
            h: even(out_height as f64),
        };
    }
    let scale =
        (out_width as f64 / source_width as f64).min(out_height as f64 / source_height as f64);
    let w = even(source_width as f64 * scale).min(even(out_width as f64));
    let h = even(source_height as f64 * scale).min(even(out_height as f64));
    Rect {
        x: (out_width as i32 - w as i32) / 2,
        y: (out_height as i32 - h as i32) / 2,
        w,
        h,
    }
}

/// Every clip that can draw, in paint order: video tracks in array order, so
/// track 1 is underneath, which is the order the timeline shows and the render
/// composites.
pub fn placements(project: &Project, out_width: u32, out_height: u32) -> Vec<Placement> {
    let mut placements = Vec::new();
    for track in project
        .tracks
        .iter()
        .filter(|track| track.kind == TrackKind::Video && track.contributes())
    {
        let mut clips: Vec<_> = track
            .clips
            .iter()
            .filter(|clip| clip.duration_frames() > 0)
            .collect();
        clips.sort_by_key(|clip| clip.start);
        for clip in clips {
            let Some(asset) = project.asset(&clip.asset_id) else {
                continue;
            };
            if !matches!(asset.kind, AssetKind::Video | AssetKind::Image) {
                continue;
            }
            placements.push(Placement {
                clip_id: clip.id.clone(),
                asset_id: asset.id.clone(),
                path: asset.path.clone(),
                kind: asset.kind,
                start_frame: clip.start,
                duration_frames: clip.duration_frames(),
                in_frame: clip.in_point,
                dst: fit_rect(asset.width, asset.height, out_width, out_height),
                opacity: clip.opacity.clamp(0.0, 1.0),
                speed: clip.speed,
                blend_mode: clip.blend_mode,
            });
        }
    }
    placements
}

/// What to draw on `frame`, bottom layer first. Derived from `placements` so
/// the frame the preview shows and the frames the render encodes are chosen by
/// one piece of code rather than two that agree by accident.
pub fn layers_at(project: &Project, frame: i64, out_width: u32, out_height: u32) -> Vec<Layer> {
    placements(project, out_width, out_height)
        .into_iter()
        .filter(|placement| placement.covers(frame))
        .map(|placement| Layer {
            source_frame: placement.in_frame
                + ((frame - placement.start_frame) as f64 * placement.speed as f64).floor() as i64,
            clip_id: placement.clip_id,
            asset_id: placement.asset_id,
            path: placement.path,
            kind: placement.kind,
            dst: placement.dst,
            opacity: placement.opacity,
            blend_mode: placement.blend_mode,
        })
        .collect()
}

/// How many frames the whole render is, so the frame loop and the progress bar
/// agree on where the end is.
///
/// It used to be a length in milliseconds multiplied by a rate and rounded up,
/// which is where a render could end up a frame short of its own last clip.
/// The project already counts frames, so there is nothing left to work out.
pub fn frame_count(project: &Project) -> i64 {
    project.duration_frames()
}

/// The instant frame `index` samples. Frames are sampled at their start, which
/// is what ffmpeg's own fps filter does, so a clip starting exactly on a frame
/// boundary appears on that frame and not the one after.
///
/// This is the function that used to be `index * 1000 / fps` in whole
/// milliseconds — 66 for the second frame of 30 fps where the truth is 66.67,
/// and an error that grew with the index. A frame index simply is a time now,
/// so there is nothing to divide.
pub fn frame_time(index: i64, rate: Rate) -> RationalTime {
    RationalTime::new(index, rate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Asset, Clip, ProjectSettings, Track};

    fn asset(id: &str, kind: AssetKind, width: u32, height: u32) -> Asset {
        Asset {
            id: id.into(),
            path: format!("/m/{id}.mp4"),
            name: id.into(),
            kind,
            duration_ms: 10_000,
            width,
            height,
            has_audio: false,
        }
    }

    fn clip(id: &str, asset_id: &str, start: i64, in_point: i64, out_point: i64) -> Clip {
        Clip {
            id: id.into(),
            asset_id: asset_id.into(),
            link_group: None,
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
        }
    }

    fn project(tracks: Vec<Track>, assets: Vec<Asset>) -> Project {
        Project {
            version: crate::FORMAT_VERSION,
            settings: ProjectSettings {
                width: 1920,
                height: 1080,
                rate: Rate::fps(30),
            },
            assets,
            tracks,
            markers: Vec::new(),
        }
    }

    fn video_track(id: &str, clips: Vec<Clip>) -> Track {
        Track {
            id: id.into(),
            kind: TrackKind::Video,
            name: id.into(),
            clips,
            visual_items: Vec::new(),
            subtitle_style: None,
            muted: false,
            hidden: false,
        }
    }

    #[test]
    fn linked_video_and_audio_mix_once() {
        let mut video = clip("v", "a", 0, 0, 120);
        video.link_group = Some("g1".into());
        let mut audio = clip("a", "a", 0, 0, 120);
        audio.link_group = Some("g1".into());
        let mut source = asset("a", AssetKind::Video, 1920, 1080);
        source.has_audio = true;
        let project = project(
            vec![
                video_track("V1", vec![video]),
                audio_track("A1", vec![audio]),
            ],
            vec![source],
        );

        let placements = audio_placements(&project);
        assert_eq!(placements.len(), 1);
        assert_eq!(placements[0].clip_id, "a");
    }

    #[test]
    fn a_matching_aspect_fills_the_frame() {
        assert_eq!(
            fit_rect(1280, 720, 1920, 1080),
            Rect {
                x: 0,
                y: 0,
                w: 1920,
                h: 1080
            }
        );
    }

    #[test]
    fn a_four_by_three_source_is_pillarboxed_and_centred() {
        // This is the case the render was checked against pixel by pixel: the
        // middle is the clip and the bars either side show the track below.
        let rect = fit_rect(640, 480, 1920, 1080);
        assert_eq!(
            rect,
            Rect {
                x: 240,
                y: 0,
                w: 1440,
                h: 1080
            }
        );
        assert_eq!(rect.x as u32 * 2 + rect.w, 1920, "the bars are equal");
    }

    #[test]
    fn a_vertical_source_in_a_landscape_frame_is_letterboxed_sideways() {
        let rect = fit_rect(1080, 1920, 1920, 1080);
        assert_eq!(
            rect,
            Rect {
                x: 656,
                y: 0,
                w: 608,
                h: 1080
            }
        );
    }

    #[test]
    fn a_source_never_grows_past_the_frame() {
        let rect = fit_rect(3840, 2160, 1920, 1080);
        assert_eq!(
            rect,
            Rect {
                x: 0,
                y: 0,
                w: 1920,
                h: 1080
            }
        );
    }

    #[test]
    fn every_fitted_size_is_even() {
        for (sw, sh) in [(1999u32, 1001u32), (33, 17), (101, 99)] {
            let rect = fit_rect(sw, sh, 1920, 1080);
            assert_eq!(rect.w % 2, 0, "{sw}x{sh} gave width {}", rect.w);
            assert_eq!(rect.h % 2, 0, "{sw}x{sh} gave height {}", rect.h);
        }
    }

    #[test]
    fn an_unmeasured_source_fills_the_frame_rather_than_guessing() {
        assert_eq!(
            fit_rect(0, 0, 1920, 1080),
            Rect {
                x: 0,
                y: 0,
                w: 1920,
                h: 1080
            }
        );
    }

    #[test]
    fn layers_come_back_bottom_track_first() {
        let project = project(
            vec![
                video_track("V1", vec![clip("c1", "a1", 0, 0, 120)]),
                video_track("V2", vec![clip("c2", "a2", 0, 0, 120)]),
            ],
            vec![
                asset("a1", AssetKind::Video, 1280, 720),
                asset("a2", AssetKind::Video, 640, 480),
            ],
        );
        let layers = layers_at(&project, 30, 1920, 1080);
        assert_eq!(layers.len(), 2);
        assert_eq!(layers[0].clip_id, "c1", "V1 is drawn first, underneath");
        assert_eq!(layers[1].clip_id, "c2");
        assert_eq!(
            layers[1].dst,
            Rect {
                x: 240,
                y: 0,
                w: 1440,
                h: 1080
            }
        );
    }

    #[test]
    fn a_layer_knows_which_frame_of_its_source_it_is() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 60, 45, 180)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        // Thirty frames into a clip that starts 45 frames into its source.
        assert_eq!(layers_at(&project, 90, 1920, 1080)[0].source_frame, 75);
    }

    #[test]
    fn nothing_is_drawn_outside_a_clip() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 30, 0, 60)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        assert!(layers_at(&project, 29, 1920, 1080).is_empty());
        assert_eq!(
            layers_at(&project, 30, 1920, 1080).len(),
            1,
            "inclusive start"
        );
        assert!(
            layers_at(&project, 90, 1920, 1080).is_empty(),
            "exclusive end"
        );
    }

    #[test]
    fn a_hidden_track_draws_nothing() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        project.tracks[0].hidden = true;
        assert!(layers_at(&project, 30, 1920, 1080).is_empty());
    }

    #[test]
    fn a_muted_video_track_still_draws() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        project.tracks[0].muted = true;
        assert_eq!(layers_at(&project, 30, 1920, 1080).len(), 1);
    }

    #[test]
    fn an_audio_asset_on_a_video_track_is_not_a_layer() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![asset("a1", AssetKind::Audio, 0, 0)],
        );
        assert!(layers_at(&project, 30, 1920, 1080).is_empty());
    }

    fn audio_track(id: &str, clips: Vec<Clip>) -> Track {
        Track {
            id: id.into(),
            kind: TrackKind::Audio,
            name: id.into(),
            clips,
            visual_items: Vec::new(),
            subtitle_style: None,
            muted: false,
            hidden: false,
        }
    }

    fn sounding(id: &str, kind: AssetKind) -> Asset {
        Asset {
            has_audio: true,
            ..asset(id, kind, 1920, 1080)
        }
    }

    fn audible(project: &Project) -> Vec<String> {
        audio_placements(project)
            .into_iter()
            .map(|placement| placement.clip_id)
            .collect()
    }

    #[test]
    fn a_video_clip_with_sound_is_audible_and_a_silent_one_is_not() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Video)],
        );
        assert_eq!(audible(&project), vec!["c1"]);
        project.assets[0].has_audio = false;
        assert!(audible(&project).is_empty());
    }

    #[test]
    fn a_still_is_never_audible_however_it_is_labelled() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Image)],
        );
        assert!(audible(&project).is_empty());
    }

    #[test]
    fn muting_takes_the_sound_from_either_kind_of_track() {
        // The asymmetry worth pinning: a muted video track keeps its picture
        // and loses its sound, which is the pair of assertions here and next
        // door in `a_muted_video_track_still_draws`.
        let mut on_video = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Video)],
        );
        on_video.tracks[0].muted = true;
        assert!(audible(&on_video).is_empty());
        assert_eq!(layers_at(&on_video, 30, 1920, 1080).len(), 1);

        let mut on_audio = project(
            vec![audio_track("A1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Audio)],
        );
        assert_eq!(audible(&on_audio), vec!["c1"]);
        on_audio.tracks[0].muted = true;
        assert!(audible(&on_audio).is_empty());
    }

    #[test]
    fn hiding_a_track_silences_it_too() {
        // Hiding a track to see what is under it takes its sound with it, which
        // is the point: what is left is what the render would produce.
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Video)],
        );
        project.tracks[0].hidden = true;
        assert!(audible(&project).is_empty());
    }

    #[test]
    fn audible_clips_come_back_video_tracks_first_then_audio_tracks() {
        // Not because a sum has an order, but because the render feeds its
        // inputs to ffmpeg in this order and a report from either side should
        // list the same clips the same way.
        let project = project(
            vec![
                audio_track("A1", vec![clip("c3", "a2", 0, 0, 120)]),
                video_track("V1", vec![clip("c1", "a1", 60, 0, 120)]),
                video_track("V2", vec![clip("c2", "a1", 0, 0, 120)]),
            ],
            vec![
                sounding("a1", AssetKind::Video),
                sounding("a2", AssetKind::Audio),
            ],
        );
        assert_eq!(audible(&project), vec!["c1", "c2", "c3"]);
    }

    #[test]
    fn an_audible_clip_carries_its_own_volume_and_span() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 60, 45, 180)])],
            vec![sounding("a1", AssetKind::Video)],
        );
        project.tracks[0].clips[0].volume = 0.25;
        let placement = &audio_placements(&project)[0];
        assert_eq!(placement.start_frame, 60);
        assert_eq!(placement.duration_frames, 135);
        assert_eq!(placement.end_frame(), 195);
        assert_eq!(placement.in_frame, 45);
        assert_eq!(placement.volume, 0.25);
        assert!(placement.covers(60) && placement.covers(194));
        assert!(!placement.covers(59) && !placement.covers(195));

        // A negative volume is a file that has been edited by hand rather than
        // an instruction to invert the phase.
        project.tracks[0].clips[0].volume = -2.0;
        assert_eq!(audio_placements(&project)[0].volume, 0.0);
    }

    #[test]
    fn a_clip_pointing_at_an_asset_that_is_gone_is_simply_not_there() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "missing", 0, 0, 120)])],
            vec![sounding("a1", AssetKind::Video)],
        );
        assert!(audible(&project).is_empty());
    }

    #[test]
    fn the_render_is_exactly_as_long_as_the_timeline() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 30)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        assert_eq!(frame_count(&project), 30);
        project.tracks[0].clips[0].out_point = 31;
        assert_eq!(frame_count(&project), 31, "no partial frame to round up");
        project.tracks[0].clips.clear();
        assert_eq!(frame_count(&project), 0);
    }

    #[test]
    fn a_frame_index_is_its_own_time_at_every_rate() {
        // The old version of this divided by the frame rate in milliseconds and
        // gave 33 for frame 1 of 30 fps, then 66 for frame 2 where the truth is
        // 66.67. Ten seconds of 29.97 is where it showed.
        assert_eq!(frame_time(0, Rate::fps(30)).to_seconds(), 0.0);
        assert_eq!(frame_time(30, Rate::fps(30)).seconds_text(6), "1.000000");
        assert_eq!(frame_time(1, Rate::fps(30)).seconds_text(6), "0.033333");
        assert_eq!(frame_time(300, Rate::ntsc(30)).seconds_text(6), "10.010000");
    }
}
