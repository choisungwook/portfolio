//! Auto mode: measure the photo and choose slider values that are easy on the
//! eye. Each kind sets only its own sliders and measures the photo as the
//! current edit shows it with those sliders at zero, so pressing one button
//! after another builds on what is already there.
//!
//! The targets are plain rules of thumb (average brightness near middle gray,
//! a full but unclipped range, gray stays gray) applied part of the way, so a
//! sunset stays warm and a night shot stays dark.

use crate::develop::{luma, srgb_to_linear};
use crate::edit::Edit;
use crate::{decode, render};
use image::RgbImage;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Straighten,
    Color,
    Brightness,
    Light,
    Contrast,
    Vivid,
}

/// The order `All` runs in: level the picture, then neutral color, then
/// brightness, which the remaining measurements depend on.
pub const ALL: [Kind; 6] = [Kind::Straighten, Kind::Color, Kind::Brightness, Kind::Light, Kind::Contrast, Kind::Vivid];

impl Kind {
    pub fn parse(name: &str) -> crate::Result<Kind> {
        serde_json::from_value(serde_json::Value::String(name.to_ascii_lowercase()))
            .map_err(|_| format!("unknown auto kind '{name}' (straighten, color, brightness, light, contrast, vivid)"))
    }
}

#[derive(Debug, Serialize)]
pub struct Outcome {
    pub edit: Edit,
    /// One line per kind, saying what it did or why it left things alone.
    pub notes: Vec<String>,
}

/// The size auto measures at. Large enough for lines, small enough to be instant.
const ANALYSIS_EDGE: u32 = 640;

pub fn analysis_copy(source: &RgbImage) -> RgbImage {
    decode::fit(source.clone(), Some(ANALYSIS_EDGE))
}

pub fn run(source: &RgbImage, edit: &Edit, kinds: &[Kind]) -> Outcome {
    let small = analysis_copy(source);
    let mut edit = edit.sanitized();
    let mut notes = Vec::new();
    for kind in ALL.iter().filter(|k| kinds.contains(k)) {
        let note = match kind {
            Kind::Straighten => straighten(&small, &mut edit),
            Kind::Color => color(&small, &mut edit),
            Kind::Brightness => brightness(&small, &mut edit),
            Kind::Light => light(&small, &mut edit),
            Kind::Contrast => contrast(&small, &mut edit),
            Kind::Vivid => vivid(&small, &mut edit),
        };
        notes.push(note);
    }
    Outcome { edit, notes }
}

/// The photo as `edit` renders it, as display values.
fn pixels(small: &RgbImage, edit: &Edit) -> Vec<[f32; 3]> {
    render::render(small, edit)
        .pixels()
        .map(|p| [p[0] as f32 / 255.0, p[1] as f32 / 255.0, p[2] as f32 / 255.0])
        .collect()
}

fn percentile(sorted: &[f32], p: f32) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }
    let i = ((sorted.len() - 1) as f32 * p).round() as usize;
    sorted[i]
}

fn sorted_luma(px: &[[f32; 3]]) -> Vec<f32> {
    let mut l: Vec<f32> = px.iter().map(|p| luma(p[0], p[1], p[2])).collect();
    l.sort_by(f32::total_cmp);
    l
}

fn round_to(v: f32, step: f32) -> f32 {
    // + 0.0 turns -0.0 into 0.0, which reads oddly in the CLI's JSON.
    (v / step).round() * step + 0.0
}

fn brightness(small: &RgbImage, edit: &mut Edit) -> String {
    let base = Edit { exposure: 0.0, ..edit.clone() };
    let px = pixels(small, &base);
    let lin: Vec<f32> = px.iter().map(|p| srgb_to_linear(luma(p[0], p[1], p[2])).max(1e-4)).collect();
    let log_mean = lin.iter().map(|v| v.ln()).sum::<f32>() / lin.len().max(1) as f32;
    let mut sorted = lin.clone();
    sorted.sort_by(f32::total_cmp);
    let bright = percentile(&sorted, 0.99).max(1e-3);
    // Aim the average at middle gray, but stop before the brightest 1% clips
    // hard; half a stop past it is left to the highlight roll-off.
    let to_gray = (0.18f32.ln() - log_mean) / std::f32::consts::LN_2;
    let to_clip = (0.95 / bright).log2() + 0.5;
    let ev = (to_gray.min(to_clip) * 0.75).clamp(-2.0, 2.0);
    edit.exposure = round_to(ev, 0.05);
    format!("brightness: exposure {:+.2}", edit.exposure)
}

fn light(small: &RgbImage, edit: &mut Edit) -> String {
    let base = Edit { highlights: 0.0, shadows: 0.0, ..edit.clone() };
    let l = sorted_luma(&pixels(small, &base));
    let n = l.len().max(1) as f32;
    let blown = l.iter().filter(|v| **v > 0.92).count() as f32 / n;
    let dark = l.iter().filter(|v| **v < 0.1).count() as f32 / n;
    edit.highlights = round_to(-(blown * 400.0).min(70.0), 1.0);
    edit.shadows = round_to((dark * 250.0).min(50.0), 1.0);
    format!("light: highlights {:+}, shadows {:+}", edit.highlights, edit.shadows)
}

fn contrast(small: &RgbImage, edit: &mut Edit) -> String {
    let base = Edit { contrast: 0.0, ..edit.clone() };
    let l = sorted_luma(&pixels(small, &base));
    let spread = percentile(&l, 0.98) - percentile(&l, 0.02);
    // A flat picture gets more, one that already spans the range gets a touch less.
    edit.contrast = round_to(((0.8 - spread) * 120.0).clamp(-20.0, 40.0), 1.0);
    format!("contrast: {:+} (range {:.2})", edit.contrast, spread)
}

fn vivid(small: &RgbImage, edit: &mut Edit) -> String {
    let base = Edit { vibrance: 0.0, saturation: 0.0, ..edit.clone() };
    let px = pixels(small, &base);
    let chroma = px.iter().map(|p| p[0].max(p[1]).max(p[2]) - p[0].min(p[1]).min(p[2])).sum::<f32>()
        / px.len().max(1) as f32;
    edit.saturation = 0.0;
    edit.vibrance = if chroma > 0.3 { -10.0 } else { round_to(((0.2 - chroma) * 250.0).clamp(0.0, 40.0), 1.0) };
    format!("vivid: vibrance {:+} (color {:.2})", edit.vibrance, chroma)
}

fn color(small: &RgbImage, edit: &mut Edit) -> String {
    let base = Edit { warmth: 0.0, tint: 0.0, ..edit.clone() };
    let px = pixels(small, &base);
    // Gray world over the midtones, leaving out strong colors so a red wall or
    // a blue sky does not decide the balance.
    let mut sum = [0.0f64; 3];
    let mut count = 0;
    for p in &px {
        let y = luma(p[0], p[1], p[2]);
        let chroma = p[0].max(p[1]).max(p[2]) - p[0].min(p[1]).min(p[2]);
        if (0.15..0.9).contains(&y) && chroma < 0.35 {
            for c in 0..3 {
                sum[c] += srgb_to_linear(p[c]) as f64;
            }
            count += 1;
        }
    }
    if count < px.len() / 20 {
        return "color: left alone (too few neutral areas to judge)".into();
    }
    let [r, g, b] = sum.map(|v| (v / count as f64).max(1e-4) as f32);
    // Warmth moves log2(r/b) by 0.6 per 100, tint moves green by 0.25 per 100.
    // Correct half of the cast: the light's mood is part of the photo.
    let warmth = -(r / b).log2() / 0.6 * 100.0 * 0.5;
    let tint = (g / (r * b).sqrt()).log2() / 0.25 * 100.0 * 0.5;
    edit.warmth = round_to(warmth.clamp(-60.0, 60.0), 1.0);
    edit.tint = round_to(tint.clamp(-25.0, 25.0), 1.0);
    format!("color: warmth {:+}, tint {:+}", edit.warmth, edit.tint)
}

/// How well edges line up with rows and columns once the picture is turned
/// back by `tilt`. A level horizon puts its whole edge in one row, a level
/// wall in one column, so the score peaks sharply at the right angle. Curved
/// shapes like hills or a tree score about the same at every angle.
fn alignment(image: &RgbImage, tilt: f32) -> f32 {
    let level = crate::geometry::straighten_and_crop(image, -tilt, None);
    let (w, h) = (level.width() as usize, level.height() as usize);
    let gray: Vec<f32> = level.pixels().map(|p| luma(p[0] as f32, p[1] as f32, p[2] as f32)).collect();
    let mut rows = vec![0.0f32; h];
    let mut cols = vec![0.0f32; w];
    for y in 1..h {
        for x in 1..w {
            let v = gray[y * w + x];
            rows[y] += (v - gray[(y - 1) * w + x]).abs();
            cols[x] += (v - gray[y * w + x - 1]).abs();
        }
    }
    // Normalized by size, since the frame shrinks a little as the angle grows.
    let (wf, hf) = (w as f32, h as f32);
    rows.iter().map(|r| r * r).sum::<f32>() / (wf * wf * hf) + cols.iter().map(|c| c * c).sum::<f32>() / (hf * hf * wf)
}

fn best_angle(image: &RgbImage, angles: impl Iterator<Item = f32>) -> Vec<(f32, f32)> {
    angles.map(|t| (t, alignment(image, t))).collect()
}

/// Degrees clockwise the content is tilted, or None when nothing in the
/// picture is straight enough to judge by.
pub fn detect_tilt(image: &RgbImage) -> Option<f32> {
    const RANGE: i32 = 40; // quarter degrees, so ±10°
    const CONFIDENT: f32 = 1.4;
    let coarse_image = decode::fit(image.clone(), Some(320));
    let coarse = best_angle(&coarse_image, (-RANGE..=RANGE).map(|i| i as f32 * 0.25));
    let (angle, peak) = coarse.iter().copied().max_by(|a, b| a.1.total_cmp(&b.1))?;
    let mut scores: Vec<f32> = coarse.iter().map(|c| c.1).collect();
    scores.sort_by(f32::total_cmp);
    let median = scores[scores.len() / 2];
    // Measured: a sea horizon peaks at 2.4x its median, hills and a tree at 1.1-1.2x.
    if median <= 0.0 || peak / median < CONFIDENT {
        return None;
    }
    let fine = best_angle(image, (-5..=5).map(|i| angle + i as f32 * 0.05));
    fine.into_iter().max_by(|a, b| a.1.total_cmp(&b.1)).map(|(t, _)| t)
}

fn straighten(small: &RgbImage, edit: &mut Edit) -> String {
    let level = Edit { straighten: 0.0, crop: None, ..Edit::default() };
    let turned = render::geometry_only(small, &Edit { rotate: edit.rotate, ..level });
    match detect_tilt(&turned) {
        Some(tilt) if tilt.abs() < 0.3 => {
            edit.straighten = 0.0;
            "straighten: already level".into()
        }
        Some(tilt) => {
            edit.straighten = round_to(-tilt, 0.1);
            format!("straighten: {:+.1} degrees", edit.straighten)
        }
        None => "straighten: left alone (no clear horizon or vertical line)".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry;

    /// Sky over ground with a sharp horizon, tilted by `degrees` clockwise.
    fn horizon(degrees: f32) -> RgbImage {
        let flat = RgbImage::from_fn(900, 600, |_, y| {
            if y < 300 { image::Rgb([150, 190, 230]) } else { image::Rgb([60, 80, 40]) }
        });
        geometry::straighten_and_crop(&flat, degrees, None)
    }

    #[test]
    fn straighten_undoes_a_tilt() {
        for tilt in [-6.0f32, 4.0] {
            let img = horizon(tilt);
            let out = run(&img, &Edit::default(), &[Kind::Straighten]);
            assert!((out.edit.straighten + tilt).abs() < 0.25, "tilt {tilt} gave {}", out.edit.straighten);
        }
    }

    #[test]
    fn straighten_leaves_noise_alone() {
        let noise = RgbImage::from_fn(300, 200, |x, y| {
            let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA77);
            h ^= h >> 13;
            h = h.wrapping_mul(0x2C1B_3C6D);
            let v = (h >> 24) as u8;
            image::Rgb([v, v, v])
        });
        let out = run(&noise, &Edit::default(), &[Kind::Straighten]);
        assert_eq!(out.edit.straighten, 0.0);
    }

    #[test]
    fn straighten_leaves_curved_hills_alone() {
        let hills = RgbImage::from_fn(640, 420, |x, y| {
            let ridge = 220.0 + 60.0 * (x as f32 / 70.0).sin() + 25.0 * (x as f32 / 23.0).cos();
            if (y as f32) < ridge { image::Rgb([170, 200, 235]) } else { image::Rgb([70, 110, 60]) }
        });
        assert_eq!(run(&hills, &Edit::default(), &[Kind::Straighten]).edit.straighten, 0.0);
    }

    #[test]
    fn brightness_lifts_a_dark_photo_and_lowers_a_bright_one() {
        let dark = RgbImage::from_fn(100, 100, |x, _| image::Rgb([(x / 4) as u8 + 10; 3]));
        assert!(run(&dark, &Edit::default(), &[Kind::Brightness]).edit.exposure > 0.5);
        let bright = RgbImage::from_fn(100, 100, |x, _| image::Rgb([200 + (x / 2) as u8; 3]));
        assert!(run(&bright, &Edit::default(), &[Kind::Brightness]).edit.exposure < 0.0);
    }

    #[test]
    fn color_cools_a_yellow_cast() {
        let warm = RgbImage::from_fn(100, 100, |x, _| {
            let v = 80 + x as u8;
            image::Rgb([v + 30, v + 10, v.saturating_sub(20)])
        });
        let out = run(&warm, &Edit::default(), &[Kind::Color]);
        assert!(out.edit.warmth < -5.0, "warmth {}", out.edit.warmth);
    }

    #[test]
    fn contrast_and_vivid_help_a_flat_dull_photo() {
        let flat = RgbImage::from_fn(100, 100, |x, _| image::Rgb([110 + (x / 5) as u8, 115, 120]));
        let out = run(&flat, &Edit::default(), &[Kind::Contrast, Kind::Vivid]);
        assert!(out.edit.contrast > 20.0);
        assert!(out.edit.vibrance > 0.0);
    }

    #[test]
    fn kinds_parse_from_names() {
        assert_eq!(Kind::parse("Brightness").unwrap(), Kind::Brightness);
        assert!(Kind::parse("sharpen").is_err());
    }
}
