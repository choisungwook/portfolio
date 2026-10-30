//! Color and tone. Everything up to saturation is a per-channel function of an
//! 8-bit input, so it is folded into three 256-entry tables once per edit and
//! each pixel is three lookups plus the color math.

use crate::edit::Edit;
use crate::look::{self, Look};
use image::RgbImage;
use rayon::prelude::*;

pub fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

pub fn linear_to_srgb(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v <= 0.003_130_8 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

/// Rec. 709 luma of display values.
pub fn luma(r: f32, g: f32, b: f32) -> f32 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

/// Roll values above a knee off toward 1 instead of clipping them, so a
/// brighter exposure keeps some detail in the sky. The knee starts at 1 and
/// comes down to 0.8 over the first stop, so an unbrightened photo is left
/// exactly as it was. Slope 1 at the knee, so no kink.
fn shoulder(x: f32, exposure: f32) -> f32 {
    let knee = 1.0 - 0.2 * exposure.clamp(0.0, 1.0);
    if x <= knee || knee >= 1.0 {
        x
    } else {
        let room = 1.0 - knee;
        knee + room * (1.0 - (-(x - knee) / room).exp())
    }
}

/// S curve around the middle. `amount` in -1..1; the slope stays positive, so
/// the curve never inverts.
pub fn contrast_curve(x: f32, amount: f32) -> f32 {
    use std::f32::consts::TAU;
    x - amount * 0.6 * (TAU * x).sin() / TAU
}

/// The bump's derivative peaks at 1 in magnitude, so a gain under 1 keeps
/// both curves monotonic at either extreme.
const TONE_GAIN: f32 = 0.9;

/// Lift or lower the dark part of the range, peak at 0.25.
fn shadow_curve(x: f32, amount: f32) -> f32 {
    x + amount * TONE_GAIN * x * (1.0 - x).powi(3)
}

/// Lift or lower the bright part of the range, peak at 0.75.
fn highlight_curve(x: f32, amount: f32) -> f32 {
    x + amount * TONE_GAIN * x.powi(3) * (1.0 - x)
}

/// White balance gains for linear RGB, normalized so gray keeps its brightness.
fn white_balance(warmth: f32, tint: f32) -> [f32; 3] {
    let w = warmth / 100.0;
    let t = tint / 100.0;
    let r = (0.3 * w).exp2();
    let g = (-0.25 * t).exp2();
    let b = (-0.3 * w).exp2();
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    [r / y, g / y, b / y]
}

/// The per-channel part of the pipeline for one edit.
pub struct Tables {
    channel: [[f32; 256]; 3],
    vibrance: f32,
    saturation: f32,
    look: Option<(&'static Look, f32)>,
}

impl Tables {
    pub fn new(edit: &Edit) -> Tables {
        let gains = white_balance(edit.warmth, edit.tint);
        let exposure = edit.exposure.exp2();
        let mut channel = [[0.0f32; 256]; 3];
        for (c, table) in channel.iter_mut().enumerate() {
            for (i, out) in table.iter_mut().enumerate() {
                let lin = srgb_to_linear(i as f32 / 255.0) * gains[c] * exposure;
                let mut x = linear_to_srgb(shoulder(lin, edit.exposure));
                x = shadow_curve(x, edit.shadows / 100.0);
                x = highlight_curve(x, edit.highlights / 100.0);
                x = contrast_curve(x, edit.contrast / 100.0);
                *out = x.clamp(0.0, 1.0);
            }
        }
        let look = edit
            .look
            .as_deref()
            .and_then(look::find)
            .map(|l| (l, (edit.look_amount / 100.0).clamp(0.0, 1.0)))
            .filter(|(_, amount)| *amount > 0.0);
        Tables {
            channel,
            vibrance: edit.vibrance / 100.0,
            saturation: edit.saturation / 100.0,
            look,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.look.is_none()
            && self.vibrance == 0.0
            && self.saturation == 0.0
            && self.channel.iter().all(|t| {
                t.iter()
                    .enumerate()
                    .all(|(i, v)| (v * 255.0 - i as f32).abs() < 0.5)
            })
    }

    /// One pixel. `grain` is the noise sample for this pixel, -0.5..0.5.
    pub fn pixel(&self, rgb: [u8; 3], grain: f32) -> [u8; 3] {
        let mut r = self.channel[0][rgb[0] as usize];
        let mut g = self.channel[1][rgb[1] as usize];
        let mut b = self.channel[2][rgb[2] as usize];

        if self.vibrance != 0.0 || self.saturation != 0.0 {
            let y = luma(r, g, b);
            let chroma = r.max(g).max(b) - r.min(g).min(b);
            // Vibrance does most to dull colors and little to strong ones.
            let factor = (1.0 + self.saturation) * (1.0 + self.vibrance * (1.0 - chroma).powi(2));
            r = y + (r - y) * factor;
            g = y + (g - y) * factor;
            b = y + (b - y) * factor;
        }

        if let Some((look, amount)) = self.look {
            let [lr, lg, lb] = look.apply([r, g, b], grain);
            r += (lr - r) * amount;
            g += (lg - g) * amount;
            b += (lb - b) * amount;
        }

        [to_u8(r), to_u8(g), to_u8(b)]
    }
}

fn to_u8(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

/// A stable noise value for a cell, -0.5..0.5.
fn hash_noise(x: u32, y: u32) -> f32 {
    let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA77);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    (h & 0xFFFF) as f32 / 65535.0 - 0.5
}

/// Apply color and tone in place. Grain cells are a fixed fraction of the long
/// edge, so a small preview and a full export show the same grain.
pub fn apply(image: &mut RgbImage, edit: &Edit) {
    let tables = Tables::new(edit);
    if tables.is_identity() {
        return;
    }
    let (w, h) = image.dimensions();
    let cell = (w.max(h) as f32 / 1800.0).max(1.0);
    let row_len = w as usize * 3;
    image
        .as_mut()
        .par_chunks_mut(row_len)
        .enumerate()
        .for_each(|(y, row)| {
            let gy = (y as f32 / cell) as u32;
            for (x, px) in row.chunks_exact_mut(3).enumerate() {
                let gx = (x as f32 / cell) as u32;
                let out = tables.pixel([px[0], px[1], px[2]], hash_noise(gx, gy));
                px.copy_from_slice(&out);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gray(v: u8) -> RgbImage {
        RgbImage::from_pixel(8, 8, image::Rgb([v, v, v]))
    }

    #[test]
    fn default_edit_changes_nothing() {
        let mut img = RgbImage::from_fn(16, 16, |x, y| image::Rgb([(x * 16) as u8, (y * 16) as u8, 77]));
        let before = img.clone();
        apply(&mut img, &Edit::default());
        assert_eq!(img, before);
    }

    #[test]
    fn exposure_brightens_and_never_wraps() {
        let mut img = gray(100);
        apply(&mut img, &Edit { exposure: 1.0, ..Edit::default() });
        assert!(img.get_pixel(0, 0)[0] > 120);
        let mut white = gray(250);
        apply(&mut white, &Edit { exposure: 3.0, ..Edit::default() });
        assert!(white.get_pixel(0, 0)[0] >= 250);
    }

    #[test]
    fn curves_stay_monotonic_at_their_extremes() {
        for amount in [-1.0, 1.0] {
            let mut last = -1.0;
            for i in 0..=255 {
                let x = i as f32 / 255.0;
                let y = highlight_curve(shadow_curve(contrast_curve(x, amount), amount), amount);
                assert!(y >= last, "not monotonic at {x} for {amount}");
                last = y;
            }
        }
    }

    #[test]
    fn warmth_moves_gray_toward_yellow() {
        let mut img = gray(128);
        apply(&mut img, &Edit { warmth: 60.0, ..Edit::default() });
        let p = img.get_pixel(0, 0);
        assert!(p[0] > p[2], "red {} should exceed blue {}", p[0], p[2]);
    }

    #[test]
    fn negative_saturation_makes_gray() {
        let mut img = RgbImage::from_pixel(4, 4, image::Rgb([200, 50, 50]));
        apply(&mut img, &Edit { saturation: -100.0, ..Edit::default() });
        let p = img.get_pixel(0, 0);
        assert!(p[0].abs_diff(p[1]) <= 1 && p[1].abs_diff(p[2]) <= 1);
    }
}
