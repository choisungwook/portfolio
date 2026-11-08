//! Saved Background tool presets. The editor draws the background itself;
//! this side only checks what it is asked to store.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// More than this is a list nobody scrolls through, and the cap keeps a
/// hand-edited settings.json from growing without bound.
pub const MAX_PRESETS: usize = 30;
const MAX_NAME_CHARS: usize = 40;
const MAX_PADDING: u32 = 400;
const MAX_RADIUS: u32 = 200;
const RATIOS: [&str; 5] = ["auto", "1:1", "4:3", "3:2", "16:9"];
const ALIGNS: [&str; 9] = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPreset {
    pub name: String,
    /// A background id from the editor's list, e.g. "g3" or "s1".
    pub background: String,
    /// Points around the image, scaled to image pixels when drawn.
    pub padding: u32,
    pub radius: u32,
    pub shadow: bool,
    pub ratio: String,
    pub align: String,
}

impl BackgroundPreset {
    pub fn validate(&self) -> Result<(), String> {
        let name = self.name.trim();
        if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
            return Err(format!(
                "A preset name needs 1 to {MAX_NAME_CHARS} characters"
            ));
        }
        // An id is a short ascii token. Anything else did not come from the
        // editor's list.
        let id_ok = !self.background.is_empty()
            && self.background.len() <= 16
            && self.background.chars().all(|c| c.is_ascii_alphanumeric());
        if !id_ok {
            return Err(format!("Unknown background: {}", self.background));
        }
        if self.padding > MAX_PADDING || self.radius > MAX_RADIUS {
            return Err("Padding or corner radius is out of range".into());
        }
        if !RATIOS.contains(&self.ratio.as_str()) || !ALIGNS.contains(&self.align.as_str()) {
            return Err("Unknown aspect ratio or alignment".into());
        }
        Ok(())
    }
}

/// Checks a whole list before it is saved.
pub fn validate_all(presets: &[BackgroundPreset]) -> Result<(), String> {
    if presets.len() > MAX_PRESETS {
        return Err(format!("At most {MAX_PRESETS} presets can be saved"));
    }
    presets.iter().try_for_each(BackgroundPreset::validate)
}

/// The stored list, keeping every entry that parses and validates. One broken
/// entry in a hand-edited file loses that entry, not the whole list.
pub fn parse_stored(value: Option<&Value>) -> Vec<BackgroundPreset> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| serde_json::from_value::<BackgroundPreset>(item.clone()).ok())
        .filter(|preset| preset.validate().is_ok())
        .take(MAX_PRESETS)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn preset() -> BackgroundPreset {
        BackgroundPreset {
            name: "Blog".into(),
            background: "g2".into(),
            padding: 64,
            radius: 12,
            shadow: true,
            ratio: "16:9".into(),
            align: "center".into(),
        }
    }

    #[test]
    fn a_normal_preset_validates() {
        assert!(preset().validate().is_ok());
        assert!(validate_all(&[preset(), preset()]).is_ok());
    }

    #[test]
    fn out_of_range_values_are_rejected() {
        let cases = [
            BackgroundPreset {
                name: "  ".into(),
                ..preset()
            },
            BackgroundPreset {
                background: "../x".into(),
                ..preset()
            },
            BackgroundPreset {
                padding: 401,
                ..preset()
            },
            BackgroundPreset {
                ratio: "2:1".into(),
                ..preset()
            },
            BackgroundPreset {
                align: "middle".into(),
                ..preset()
            },
        ];
        for case in cases {
            assert!(case.validate().is_err(), "{case:?}");
        }
        assert!(validate_all(&vec![preset(); MAX_PRESETS + 1]).is_err());
    }

    // A broken entry costs only itself.
    #[test]
    fn parse_stored_keeps_the_good_entries() {
        let good = serde_json::to_value(preset()).unwrap();
        let stored = json!([good, { "name": "half" }, { "name": "x", "background": "g1",
            "padding": 9999, "radius": 0, "shadow": false, "ratio": "auto", "align": "top" }]);
        assert_eq!(parse_stored(Some(&stored)), vec![preset()]);
        assert!(parse_stored(Some(&json!("nope"))).is_empty());
        assert!(parse_stored(None).is_empty());
    }
}
