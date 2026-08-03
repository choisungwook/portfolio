//! Where every clip lands in the output frame.
//!
//! This is the one place that answers "what is on screen at time T, and where".
//! Before it existed the answer was given twice — as CSS object-fit in the
//! preview and as scale plus pad in the ffmpeg filter graph — and two
//! implementations of the same arithmetic drift. Both the compositor and the
//! decoder command now read their geometry from here.
//!
//! Everything is in output pixels and integers. Floats would let the two
//! callers round differently, which is exactly the divergence this removes.

use crate::{AssetKind, Project, TrackKind};

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
    /// Where the clip sits on the timeline, and how long it lasts.
    pub start_ms: u64,
    pub duration_ms: u64,
    /// Where it starts inside the source.
    pub in_ms: u64,
    pub dst: Rect,
    pub opacity: f32,
}

impl Placement {
    pub fn end_ms(&self) -> u64 {
        self.start_ms + self.duration_ms
    }

    pub fn covers(&self, time_ms: u64) -> bool {
        time_ms >= self.start_ms && time_ms < self.end_ms()
    }
}

/// One thing to draw for one frame, bottom layer first.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
    pub clip_id: String,
    pub asset_id: String,
    pub path: String,
    pub kind: AssetKind,
    /// Where in the source this instant falls.
    pub source_ms: u64,
    pub dst: Rect,
    pub opacity: f32,
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
            .filter(|clip| clip.duration_ms() > 0)
            .collect();
        clips.sort_by_key(|clip| clip.start_ms);
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
                start_ms: clip.start_ms,
                duration_ms: clip.duration_ms(),
                in_ms: clip.in_ms,
                dst: fit_rect(asset.width, asset.height, out_width, out_height),
                opacity: clip.opacity.clamp(0.0, 1.0),
            });
        }
    }
    placements
}

/// What to draw at `time_ms`, bottom layer first. Derived from `placements` so
/// the frame the preview shows and the frames the render encodes are chosen by
/// one piece of code rather than two that agree by accident.
pub fn layers_at(project: &Project, time_ms: u64, out_width: u32, out_height: u32) -> Vec<Layer> {
    placements(project, out_width, out_height)
        .into_iter()
        .filter(|placement| placement.covers(time_ms))
        .map(|placement| Layer {
            source_ms: placement.in_ms + (time_ms - placement.start_ms),
            clip_id: placement.clip_id,
            asset_id: placement.asset_id,
            path: placement.path,
            kind: placement.kind,
            dst: placement.dst,
            opacity: placement.opacity,
        })
        .collect()
}

/// How many frames the whole render is, so the frame loop and the progress bar
/// agree on where the end is.
pub fn frame_count(total_ms: u64, fps: u32) -> u64 {
    (total_ms * fps as u64).div_ceil(1000)
}

/// The instant frame `index` samples. Frames are sampled at their start, which
/// is what ffmpeg's own fps filter does, so a clip starting exactly on a frame
/// boundary appears on that frame and not the one after.
pub fn frame_time_ms(index: u64, fps: u32) -> u64 {
    index * 1000 / fps.max(1) as u64
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

    fn clip(id: &str, asset_id: &str, start_ms: u64, in_ms: u64, out_ms: u64) -> Clip {
        Clip {
            id: id.into(),
            asset_id: asset_id.into(),
            start_ms,
            in_ms,
            out_ms,
            volume: 1.0,
            opacity: 1.0,
        }
    }

    fn project(tracks: Vec<Track>, assets: Vec<Asset>) -> Project {
        Project {
            settings: ProjectSettings {
                width: 1920,
                height: 1080,
                fps: 30,
            },
            assets,
            tracks,
        }
    }

    fn video_track(id: &str, clips: Vec<Clip>) -> Track {
        Track {
            id: id.into(),
            kind: TrackKind::Video,
            name: id.into(),
            clips,
            muted: false,
            hidden: false,
        }
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
                video_track("V1", vec![clip("c1", "a1", 0, 0, 4000)]),
                video_track("V2", vec![clip("c2", "a2", 0, 0, 4000)]),
            ],
            vec![
                asset("a1", AssetKind::Video, 1280, 720),
                asset("a2", AssetKind::Video, 640, 480),
            ],
        );
        let layers = layers_at(&project, 1000, 1920, 1080);
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
    fn a_layer_knows_where_it_is_inside_its_source() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 2000, 1500, 6000)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        // One second into a clip that starts 1.5s into its source.
        assert_eq!(layers_at(&project, 3000, 1920, 1080)[0].source_ms, 2500);
    }

    #[test]
    fn nothing_is_drawn_outside_a_clip() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 1000, 0, 2000)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        assert!(layers_at(&project, 999, 1920, 1080).is_empty());
        assert_eq!(
            layers_at(&project, 1000, 1920, 1080).len(),
            1,
            "inclusive start"
        );
        assert!(
            layers_at(&project, 3000, 1920, 1080).is_empty(),
            "exclusive end"
        );
    }

    #[test]
    fn a_hidden_track_draws_nothing() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 4000)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        project.tracks[0].hidden = true;
        assert!(layers_at(&project, 1000, 1920, 1080).is_empty());
    }

    #[test]
    fn a_muted_video_track_still_draws() {
        let mut project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 4000)])],
            vec![asset("a1", AssetKind::Video, 1920, 1080)],
        );
        project.tracks[0].muted = true;
        assert_eq!(layers_at(&project, 1000, 1920, 1080).len(), 1);
    }

    #[test]
    fn an_audio_asset_on_a_video_track_is_not_a_layer() {
        let project = project(
            vec![video_track("V1", vec![clip("c1", "a1", 0, 0, 4000)])],
            vec![asset("a1", AssetKind::Audio, 0, 0)],
        );
        assert!(layers_at(&project, 1000, 1920, 1080).is_empty());
    }

    #[test]
    fn frames_are_counted_so_the_last_instant_is_covered() {
        assert_eq!(frame_count(1000, 30), 30);
        assert_eq!(
            frame_count(1001, 30),
            31,
            "a partial frame still gets drawn"
        );
        assert_eq!(frame_count(0, 30), 0);
    }

    #[test]
    fn a_frame_samples_its_own_start() {
        assert_eq!(frame_time_ms(0, 30), 0);
        assert_eq!(frame_time_ms(30, 30), 1000);
        assert_eq!(frame_time_ms(1, 30), 33);
    }
}
