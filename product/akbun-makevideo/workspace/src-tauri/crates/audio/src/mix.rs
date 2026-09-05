//! Where each clip's sound sits on the timeline, and what mixing them means.
//!
//! The render mixes with `amix=normalize=0`, which is a plain sum: every input
//! is added at its own level and nothing is divided by the number of inputs and
//! nothing is limited. This module is that sentence written in Rust, so that
//! the mix a person hears while editing is the mix that comes out of the file.
//!
//! The part worth being careful about is not the addition, it is the offsets.
//! The render places a clip with `adelay=<n>S`, a whole number of samples
//! computed by `RationalTime::to_samples`. [`Region`] computes its own offsets
//! with the same call on the same numbers, so neither side rounds a second
//! time. Anything else — milliseconds, seconds as f64 — reintroduces the drift
//! the time crate exists to remove, and it does it half a millisecond at a
//! time where nobody notices until an hour in.

use crate::realtime::{CHANNELS, ENGINE_HZ};
use makevideo_render::layout::AudioPlacement;
use makevideo_render::{AssetKind, Project, RationalTime};

/// One clip's sound, in engine samples on the timeline.
#[derive(Debug, Clone, PartialEq)]
pub struct Region {
    pub clip_id: String,
    pub path: String,
    pub kind: AssetKind,
    /// Where it starts, as the same sample count the render's `adelay` uses.
    pub start_sample: i64,
    /// One past its last sample. Anchored to the clip's **end frame on the
    /// timeline** rather than derived from its length, so the sample where one
    /// clip stops is exactly the sample where the next one starts. Working
    /// from the length instead leaves clips on a rate like 29.97 overlapping or
    /// gapping by a sample, because the two roundings are taken from different
    /// origins.
    pub end_sample: i64,
    /// Where to seek the source, as a time, because that is what ffmpeg takes.
    pub in_time: RationalTime,
    pub duration: RationalTime,
    pub volume: f32,
    pub volume_keyframes: makevideo_render::KeyframeTrack,
    pub fade_in_samples: i64,
    pub fade_out_samples: i64,
    pub speed: f32,
    pub preserve_pitch: bool,
    pub rate: makevideo_render::Rate,
}

impl Region {
    pub fn frames(&self) -> i64 {
        (self.end_sample - self.start_sample).max(0)
    }

    pub fn covers(&self, sample: i64) -> bool {
        sample >= self.start_sample && sample < self.end_sample
    }

    pub fn gain_at(&self, sample: i64) -> f32 {
        let timeline_frame = ((sample as f64 * self.rate.num() as f64)
            / (ENGINE_HZ as f64 * self.rate.den() as f64))
            .floor() as i64;
        let mut gain = self
            .volume_keyframes
            .value_at(timeline_frame, self.volume)
            .clamp(0.0, 1.0);
        let offset = sample.saturating_sub(self.start_sample);
        if self.fade_in_samples > 0 {
            gain *= (offset as f32 / self.fade_in_samples as f32).clamp(0.0, 1.0);
        }
        let remaining = self.end_sample.saturating_sub(sample + 1);
        if self.fade_out_samples > 0 {
            gain *= (remaining as f32 / self.fade_out_samples as f32).clamp(0.0, 1.0);
        }
        gain
    }
}

/// Every audible clip as a span of samples. The order is `audio_placements`'
/// order, which is the render's input order.
pub fn regions(project: &Project) -> Vec<Region> {
    let rate = project.rate();
    makevideo_render::layout::audio_placements(project)
        .into_iter()
        .map(|placement| region(&placement, rate))
        .collect()
}

fn region(placement: &AudioPlacement, rate: makevideo_render::Rate) -> Region {
    Region {
        start_sample: RationalTime::new(placement.start_frame, rate).to_samples(ENGINE_HZ),
        end_sample: RationalTime::new(placement.end_frame(), rate).to_samples(ENGINE_HZ),
        in_time: placement.in_time(rate),
        duration: placement.duration(rate),
        volume: placement.volume,
        volume_keyframes: placement.volume_keyframes.clone(),
        fade_in_samples: RationalTime::new(placement.fade_in, rate).to_samples(ENGINE_HZ),
        fade_out_samples: RationalTime::new(placement.fade_out, rate).to_samples(ENGINE_HZ),
        speed: placement.speed,
        preserve_pitch: placement.preserve_pitch,
        rate,
        clip_id: placement.clip_id.clone(),
        path: placement.path.clone(),
        kind: placement.kind,
    }
}

/// How long the whole mix is, in engine samples. The timeline decides, not the
/// clips: a project that ends on silence still ends where it says it does.
pub fn total_samples(project: &Project) -> i64 {
    RationalTime::new(project.duration_frames(), project.rate()).to_samples(ENGINE_HZ)
}

/// Add `input` into `out` at `offset` sample frames, scaled by `volume`.
///
/// This is the whole of `amix=normalize=0`: `+=`, not an average. Whatever runs
/// off the end of `out` is dropped rather than wrapped, so a caller that
/// miscounts loses sound instead of hearing the next block's sound early.
///
/// Nothing is clipped to ±1 here either, and that is on purpose. `amix` does
/// not clip, the encoder is what eventually does, and a mixer that quietly
/// limited would make a loud project sound different on playback than in the
/// file — which is exactly the thing this crate is trying to prevent.
pub fn add_into(out: &mut [f32], offset: usize, input: &[f32], volume: f32) {
    let start = offset * CHANNELS;
    if start >= out.len() {
        return;
    }
    let room = out.len() - start;
    for (index, sample) in input.iter().take(room).enumerate() {
        out[start + index] += sample * volume;
    }
}

pub fn add_into_region(
    out: &mut [f32],
    offset: usize,
    input: &[f32],
    first_sample: i64,
    region: &Region,
) {
    let start = offset * CHANNELS;
    if start >= out.len() {
        return;
    }
    for (frame, samples) in input.chunks_exact(CHANNELS).enumerate() {
        let target = start + frame * CHANNELS;
        if target + CHANNELS > out.len() {
            break;
        }
        let gain = region.gain_at(first_sample + frame as i64);
        for channel in 0..CHANNELS {
            out[target + channel] += samples[channel] * gain;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_render::{Asset, Clip, ProjectSettings, Rate, Track, TrackKind, FORMAT_VERSION};

    fn asset(id: &str, kind: AssetKind) -> Asset {
        Asset {
            id: id.into(),
            path: format!("/m/{id}"),
            name: id.into(),
            kind,
            duration_ms: 600_000,
            width: 1920,
            height: 1080,
            has_audio: true,
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

    fn project(rate: Rate, tracks: Vec<Track>, assets: Vec<Asset>) -> Project {
        Project {
            version: FORMAT_VERSION,
            settings: ProjectSettings {
                width: 1920,
                height: 1080,
                rate,
            },
            assets,
            tracks,
            transitions: Vec::new(),
            markers: Vec::new(),
        }
    }

    fn audio_track(id: &str, clips: Vec<Clip>) -> Track {
        Track {
            id: id.into(),
            kind: TrackKind::Audio,
            name: id.into(),
            clips,
            visual_items: Vec::new(),
            muted: false,
            hidden: false,
            subtitle_style: None,
        }
    }

    #[test]
    fn a_clip_starts_on_the_sample_the_render_delays_it_to() {
        // 96000 is what `adelay=96000S` says in the export chain for a clip two
        // seconds in at 30 fps, and it is asserted over there too. If the two
        // ever disagree, one of these two tests fails.
        let project = project(
            Rate::fps(30),
            vec![audio_track("A1", vec![clip("c1", "a1", 60, 30, 120)])],
            vec![asset("a1", AssetKind::Audio)],
        );
        let region = &regions(&project)[0];
        assert_eq!(region.start_sample, 96_000);
        assert_eq!(region.frames(), 90 * 48_000 / 30);
        assert_eq!(region.in_time.seconds_text(6), "1.000000");
    }

    #[test]
    fn a_broadcast_rate_lands_on_the_sample_the_export_delays_to() {
        let project = project(
            Rate::ntsc(30),
            vec![audio_track("A1", vec![clip("c1", "a1", 60, 0, 60)])],
            vec![asset("a1", AssetKind::Audio)],
        );
        // The figure `a_broadcast_rate_delays_audio_to_the_sample_the_picture_
        // starts_on` pins on the other side.
        assert_eq!(regions(&project)[0].start_sample, 96_096);
    }

    #[test]
    fn clips_that_touch_on_the_timeline_touch_in_the_mix() {
        // The reason the end is anchored to the timeline rather than derived
        // from the length. On 29.97 a frame is 1601.6 samples, so a run of
        // clips whose lengths are each rounded on their own drifts against the
        // grid; taking both ends from the same origin cannot.
        let project = project(
            Rate::ntsc(30),
            vec![audio_track(
                "A1",
                vec![
                    clip("c1", "a1", 0, 0, 7),
                    clip("c2", "a1", 7, 0, 7),
                    clip("c3", "a1", 14, 0, 7),
                ],
            )],
            vec![asset("a1", AssetKind::Audio)],
        );
        let regions = regions(&project);
        assert_eq!(regions.len(), 3);
        for pair in regions.windows(2) {
            assert_eq!(
                pair[0].end_sample,
                pair[1].start_sample,
                "a gap or an overlap of {} samples",
                pair[1].start_sample - pair[0].end_sample
            );
        }
        assert_eq!(regions[2].end_sample, total_samples(&project));
    }

    #[test]
    fn the_mix_is_as_long_as_the_timeline_and_not_as_long_as_the_clips() {
        let project = project(
            Rate::fps(30),
            vec![audio_track("A1", vec![clip("c1", "a1", 0, 0, 30)])],
            vec![asset("a1", AssetKind::Audio)],
        );
        assert_eq!(total_samples(&project), 48_000);
    }

    #[test]
    fn covering_is_inclusive_at_the_start_and_exclusive_at_the_end() {
        let project = project(
            Rate::fps(30),
            vec![audio_track("A1", vec![clip("c1", "a1", 30, 0, 30)])],
            vec![asset("a1", AssetKind::Audio)],
        );
        let region = &regions(&project)[0];
        assert!(!region.covers(47_999));
        assert!(region.covers(48_000));
        assert!(region.covers(95_999));
        assert!(!region.covers(96_000));
    }

    #[test]
    fn mixing_adds_rather_than_averages() {
        // amix=normalize=0. Two clips at full level are twice as loud, which is
        // the whole reason normalize=0 is in the render command: with it on, a
        // second track would quietly halve the first one.
        let mut out = vec![0.0f32; 4 * CHANNELS];
        add_into(&mut out, 0, &[0.5; 4 * CHANNELS], 1.0);
        add_into(&mut out, 0, &[0.5; 4 * CHANNELS], 1.0);
        assert!(out.iter().all(|sample| (*sample - 1.0).abs() < 1e-6));
    }

    #[test]
    fn nothing_is_clipped_on_the_way_through() {
        // A mixer that limited here would sound different from the file, which
        // is the one thing this crate must not do.
        let mut out = vec![0.0f32; CHANNELS];
        add_into(&mut out, 0, &[0.9; CHANNELS], 1.0);
        add_into(&mut out, 0, &[0.9; CHANNELS], 1.0);
        assert!(out.iter().all(|sample| (*sample - 1.8).abs() < 1e-6));
    }

    #[test]
    fn volume_scales_the_clip_before_it_is_added() {
        let mut out = vec![0.0f32; 2 * CHANNELS];
        add_into(&mut out, 0, &[1.0; 2 * CHANNELS], 0.25);
        assert!(out.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn a_clip_lands_at_its_offset_and_leaves_the_rest_alone() {
        let mut out = vec![0.0f32; 4 * CHANNELS];
        add_into(&mut out, 2, &[1.0; 2 * CHANNELS], 1.0);
        assert_eq!(out, vec![0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0]);
    }

    #[test]
    fn what_runs_off_the_end_is_dropped_rather_than_wrapped() {
        // Wrapping would put the tail of a block at the front of the same
        // block, which sounds like a stutter and reads like a mixing bug.
        let mut out = vec![0.0f32; 2 * CHANNELS];
        add_into(&mut out, 1, &[1.0; 8 * CHANNELS], 1.0);
        assert_eq!(out, vec![0.0, 0.0, 1.0, 1.0]);
        // And an offset entirely past the end writes nothing at all.
        let mut out = vec![0.0f32; 2 * CHANNELS];
        add_into(&mut out, 9, &[1.0; CHANNELS], 1.0);
        assert!(out.iter().all(|sample| *sample == 0.0));
    }
}
