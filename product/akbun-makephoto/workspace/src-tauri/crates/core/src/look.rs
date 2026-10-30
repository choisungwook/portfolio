//! Film looks. Each one is a short recipe of our own numbers — a color
//! strength, a curve, a black lift, a split tone and grain — applied after the
//! basic edit and blended in by the look's strength. No LUT file is involved.

use crate::develop::{contrast_curve, luma};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Look {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    /// Black-and-white channel mix, or None for color.
    #[serde(skip)]
    mono: Option<[f32; 3]>,
    #[serde(skip)]
    saturation: f32,
    #[serde(skip)]
    contrast: f32,
    /// How far black is lifted toward gray.
    #[serde(skip)]
    fade: f32,
    /// How far white is pulled down.
    #[serde(skip)]
    roll: f32,
    #[serde(skip)]
    shadow_tint: [f32; 3],
    #[serde(skip)]
    highlight_tint: [f32; 3],
    #[serde(skip)]
    grain: f32,
}

const fn color(
    id: &'static str,
    label: &'static str,
    description: &'static str,
    saturation: f32,
    contrast: f32,
    fade: f32,
    roll: f32,
    shadow_tint: [f32; 3],
    highlight_tint: [f32; 3],
    grain: f32,
) -> Look {
    Look { id, label, description, mono: None, saturation, contrast, fade, roll, shadow_tint, highlight_tint, grain }
}

const fn mono(
    id: &'static str,
    label: &'static str,
    description: &'static str,
    mix: [f32; 3],
    contrast: f32,
    fade: f32,
    grain: f32,
) -> Look {
    Look {
        id,
        label,
        description,
        mono: Some(mix),
        saturation: 0.0,
        contrast,
        fade,
        roll: fade,
        shadow_tint: [0.0; 3],
        highlight_tint: [0.0; 3],
        grain,
    }
}

pub const LOOKS: &[Look] = &[
    color("vivid-slide", "Vivid Slide", "Rich color and deep contrast for landscapes",
        0.35, 0.35, 0.0, 0.02, [-0.01, 0.0, 0.02], [0.01, 0.005, -0.01], 0.0),
    color("soft-portrait", "Soft Portrait", "Gentle contrast and warm skin",
        -0.1, -0.15, 0.03, 0.03, [0.01, 0.0, -0.005], [0.02, 0.01, -0.005], 0.01),
    color("muted-street", "Muted Street", "Quiet color with firm shadows for street scenes",
        -0.3, 0.3, 0.02, 0.02, [-0.005, 0.0, 0.01], [0.01, 0.005, 0.0], 0.015),
    color("warm-negative", "Warm Negative", "Lifted blacks, cool shadows and warm highlights",
        -0.05, 0.1, 0.06, 0.05, [-0.01, 0.005, 0.015], [0.04, 0.02, -0.02], 0.025),
    color("cool-negative", "Cool Negative", "Lifted blacks with a cool green-blue cast",
        -0.1, 0.05, 0.05, 0.04, [-0.01, 0.015, 0.02], [0.0, 0.01, 0.02], 0.025),
    color("faded-matte", "Faded Matte", "Low contrast, soft blacks, muted color",
        -0.2, -0.2, 0.1, 0.08, [0.0, 0.0, 0.01], [0.01, 0.01, 0.0], 0.02),
    color("teal-orange", "Teal & Orange", "Cool shadows against warm skin, a movie feel",
        0.1, 0.2, 0.02, 0.02, [-0.03, 0.01, 0.04], [0.05, 0.02, -0.03], 0.0),
    color("golden-hour", "Golden Hour", "Warm late-afternoon light",
        0.1, 0.05, 0.03, 0.03, [0.02, 0.005, -0.01], [0.06, 0.03, -0.03], 0.01),
    mono("classic-mono", "Classic Mono", "Balanced black and white",
        [0.3, 0.59, 0.11], 0.15, 0.02, 0.03),
    mono("gritty-mono", "Gritty Mono", "Hard black and white with heavy grain",
        [0.4, 0.5, 0.1], 0.5, 0.0, 0.06),
];

pub fn find(id: &str) -> Option<&'static Look> {
    LOOKS.iter().find(|l| l.id == id)
}

impl Look {
    /// The fully applied look for one pixel of display values.
    pub fn apply(&self, rgb: [f32; 3], grain: f32) -> [f32; 3] {
        let [mut r, mut g, mut b] = rgb;
        if let Some([wr, wg, wb]) = self.mono {
            let y = wr * r + wg * g + wb * b;
            (r, g, b) = (y, y, y);
        } else if self.saturation != 0.0 {
            let y = luma(r, g, b);
            let k = 1.0 + self.saturation;
            (r, g, b) = (y + (r - y) * k, y + (g - y) * k, y + (b - y) * k);
        }
        let mut out = [r, g, b].map(|c| contrast_curve(c.clamp(0.0, 1.0), self.contrast));
        let y = luma(out[0], out[1], out[2]).clamp(0.0, 1.0);
        let shadow = (1.0 - y).powi(2);
        let highlight = y * y;
        // Grain shows most in the midtones, as it does on film.
        let noise = grain * self.grain * 4.0 * y * (1.0 - y) * 2.0;
        for (c, v) in out.iter_mut().enumerate() {
            let tinted = *v + self.shadow_tint[c] * shadow + self.highlight_tint[c] * highlight;
            *v = self.fade + tinted * (1.0 - self.fade - self.roll) + noise;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_findable() {
        for look in LOOKS {
            assert_eq!(find(look.id).map(|l| l.id), Some(look.id));
            assert_eq!(LOOKS.iter().filter(|l| l.id == look.id).count(), 1);
        }
        assert_eq!(LOOKS.len(), 10);
    }

    #[test]
    fn mono_looks_are_gray() {
        let out = find("classic-mono").unwrap().apply([0.8, 0.2, 0.4], 0.0);
        assert!((out[0] - out[1]).abs() < 1e-6 && (out[1] - out[2]).abs() < 1e-6);
    }

    #[test]
    fn fade_lifts_black() {
        let out = find("faded-matte").unwrap().apply([0.0, 0.0, 0.0], 0.0);
        assert!(out.iter().all(|v| *v > 0.05));
    }
}
