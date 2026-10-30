//! The edit is a handful of numbers. The original file is never written; every
//! picture on screen or on disk is rendered from the original plus this.

use serde::{Deserialize, Serialize};

/// A crop in the straightened frame, every value a fraction of that frame.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Crop {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Crop {
    /// Keep the rectangle inside the frame and at least 2% on each side.
    pub fn clamped(self) -> Crop {
        let w = self.w.clamp(0.02, 1.0);
        let h = self.h.clamp(0.02, 1.0);
        Crop {
            x: self.x.clamp(0.0, 1.0 - w),
            y: self.y.clamp(0.0, 1.0 - h),
            w,
            h,
        }
    }

    pub fn is_full(&self) -> bool {
        self.x <= 0.0001 && self.y <= 0.0001 && self.w >= 0.9999 && self.h >= 0.9999
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Edit {
    /// Brightness in stops (EV).
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    /// Blue (negative) to yellow (positive).
    pub warmth: f32,
    /// Green (negative) to magenta (positive).
    pub tint: f32,
    /// Saturation that spares colors that are already strong.
    pub vibrance: f32,
    pub saturation: f32,
    /// Degrees, positive turns the picture clockwise.
    pub straighten: f32,
    /// Quarter turns clockwise, 0 to 3.
    pub rotate: u8,
    pub crop: Option<Crop>,
    /// Film look id from [`crate::look::LOOKS`].
    pub look: Option<String>,
    pub look_amount: f32,
}

impl Default for Edit {
    fn default() -> Self {
        Edit {
            exposure: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            warmth: 0.0,
            tint: 0.0,
            vibrance: 0.0,
            saturation: 0.0,
            straighten: 0.0,
            rotate: 0,
            crop: None,
            look: None,
            look_amount: 100.0,
        }
    }
}

/// Every number a caller can set by name, with its range. The CLI prints this
/// table so an agent knows what it may send.
pub const FIELDS: &[(&str, f32, f32, &str)] = &[
    ("exposure", -3.0, 3.0, "Brightness in stops"),
    ("contrast", -100.0, 100.0, "Difference between light and dark"),
    ("highlights", -100.0, 100.0, "Bright areas; negative recovers sky"),
    ("shadows", -100.0, 100.0, "Dark areas; positive opens them up"),
    ("warmth", -100.0, 100.0, "Blue to yellow"),
    ("tint", -100.0, 100.0, "Green to magenta"),
    ("vibrance", -100.0, 100.0, "Color strength, gentle on skin"),
    ("saturation", -100.0, 100.0, "Color strength for every color"),
    ("straighten", -45.0, 45.0, "Level the horizon, degrees clockwise"),
    ("rotate", 0.0, 3.0, "Quarter turns clockwise"),
    ("look_amount", 0.0, 100.0, "Strength of the film look"),
];

impl Edit {
    /// Set one numeric field by name, clamped to its range.
    pub fn set(&mut self, name: &str, value: f32) -> crate::Result<()> {
        let (_, min, max, _) = FIELDS
            .iter()
            .find(|f| f.0 == name)
            .ok_or_else(|| format!("unknown field '{name}'"))?;
        if !value.is_finite() {
            return Err(format!("{name} must be a number"));
        }
        let v = value.clamp(*min, *max);
        match name {
            "exposure" => self.exposure = v,
            "contrast" => self.contrast = v,
            "highlights" => self.highlights = v,
            "shadows" => self.shadows = v,
            "warmth" => self.warmth = v,
            "tint" => self.tint = v,
            "vibrance" => self.vibrance = v,
            "saturation" => self.saturation = v,
            "straighten" => self.straighten = v,
            "rotate" => self.rotate = v.round() as u8,
            "look_amount" => self.look_amount = v,
            _ => unreachable!("FIELDS and set() disagree"),
        }
        Ok(())
    }

    /// Bring an edit that came from outside (the page, a hand-edited catalog)
    /// back into range, so rendering never sees NaN or a 90 degree straighten.
    pub fn sanitized(&self) -> Edit {
        let mut out = Edit {
            crop: self.crop.map(Crop::clamped).filter(|c| !c.is_full()),
            look: self
                .look
                .clone()
                .filter(|id| crate::look::find(id).is_some()),
            ..Edit::default()
        };
        for (name, _, _, _) in FIELDS {
            let v = self.get(name);
            out.set(name, if v.is_finite() { v } else { 0.0 })
                .expect("FIELDS names are valid");
        }
        out.rotate %= 4;
        out
    }

    pub fn get(&self, name: &str) -> f32 {
        match name {
            "exposure" => self.exposure,
            "contrast" => self.contrast,
            "highlights" => self.highlights,
            "shadows" => self.shadows,
            "warmth" => self.warmth,
            "tint" => self.tint,
            "vibrance" => self.vibrance,
            "saturation" => self.saturation,
            "straighten" => self.straighten,
            "rotate" => self.rotate as f32,
            "look_amount" => self.look_amount,
            _ => 0.0,
        }
    }

    pub fn is_default(&self) -> bool {
        *self == Edit::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_clamps_and_rejects_unknown_names() {
        let mut e = Edit::default();
        e.set("exposure", 9.0).unwrap();
        assert_eq!(e.exposure, 3.0);
        assert!(e.set("sharpness", 1.0).is_err());
        assert!(e.set("contrast", f32::NAN).is_err());
    }

    #[test]
    fn sanitized_repairs_bad_values() {
        let e = Edit {
            exposure: f32::NAN,
            straighten: 80.0,
            rotate: 7,
            crop: Some(Crop { x: -1.0, y: -1.0, w: 3.0, h: 3.0 }),
            look: Some("no-such-look".into()),
            ..Edit::default()
        };
        let s = e.sanitized();
        assert_eq!(s.exposure, 0.0);
        assert_eq!(s.straighten, 45.0);
        assert_eq!(s.rotate, 3);
        assert_eq!(s.look, None);
        // A crop that clamps to the whole frame is no crop.
        assert_eq!(s.crop, None);
    }

    #[test]
    fn missing_fields_take_defaults() {
        let e: Edit = serde_json::from_str(r#"{"exposure":1.0}"#).unwrap();
        assert_eq!(e.exposure, 1.0);
        assert_eq!(e.look_amount, 100.0);
    }
}
