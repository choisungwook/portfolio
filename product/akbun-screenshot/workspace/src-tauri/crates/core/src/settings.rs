use crate::background::{self, BackgroundPreset};
use crate::capture::CaptureMode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Accelerator string, e.g. CommandOrControl+Shift+4.
    pub shortcut: String,
    /// Window and fullscreen capture shortcuts. Empty means unassigned, which
    /// is the default: every obvious key is already taken by macOS.
    pub window_shortcut: String,
    pub fullscreen_shortcut: String,
    pub save_dir: String,
    /// Ships with macOS and covers Korean and English, so the editor renders
    /// both without bundling a font.
    pub default_font: String,
    /// Whether Delete and Backspace remove the selected shape in the editor. A
    /// setting because Backspace is muscle memory for "go back".
    pub delete_keys: bool,
    /// Whether a capture plays the system shutter sound. Off by default, which
    /// is how every earlier version behaved.
    pub capture_sound: bool,
    /// Whether Capture Area shows a still of the main display while the
    /// selection runs, so menus and tooltips hold still.
    pub freeze_screen: bool,
    /// Saved Background tool settings, edited from the editor. Defaulted so
    /// the settings page, which does not manage them, need not send them.
    #[serde(default)]
    pub background_presets: Vec<BackgroundPreset>,
}

impl Settings {
    pub fn defaults(home: &Path) -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+4".into(),
            // Must stay empty. merge drops an empty stored string and keeps the
            // default, so a non-empty default would come back after the user
            // cleared it.
            window_shortcut: String::new(),
            fullscreen_shortcut: String::new(),
            save_dir: home
                .join("Pictures")
                .join("akbun-screenshot")
                .to_string_lossy()
                .into(),
            default_font: "Apple SD Gothic Neo".into(),
            delete_keys: true,
            capture_sound: false,
            freeze_screen: false,
            background_presets: Vec::new(),
        }
    }

    /// Stored values over the defaults, key by key. Unknown keys are dropped
    /// and a value has to match the type of the default it replaces, so a broken
    /// file falls back to defaults and a hand-edited one cannot turn the delete
    /// toggle into a string. Keys missing from the file keep their default, so a
    /// settings.json from an older version still loads.
    pub fn merge(defaults: &Self, stored: Option<&Value>) -> Self {
        let mut merged = serde_json::to_value(defaults).expect("settings serialize");
        if let (Some(Value::Object(stored)), Value::Object(target)) = (stored, &mut merged) {
            for (key, fallback) in target.iter_mut() {
                match (stored.get(key), &*fallback) {
                    (Some(Value::String(s)), Value::String(_)) if !s.trim().is_empty() => {
                        *fallback = Value::String(s.clone())
                    }
                    (Some(Value::Bool(b)), Value::Bool(_)) => *fallback = Value::Bool(*b),
                    _ => {}
                }
            }
        }
        let mut settings: Self = serde_json::from_value(merged).expect("settings deserialize");
        // The loop above only carries strings and booleans. The preset list is
        // parsed on its own so one broken entry loses only itself.
        if let Some(Value::Object(stored)) = stored {
            settings.background_presets = background::parse_stored(stored.get("backgroundPresets"));
        }
        // Only the field the check is about. validate() also refuses a
        // shortcut used twice, and that must not move the save folder.
        if !Path::new(&settings.save_dir).is_absolute() {
            settings.save_dir = defaults.save_dir.clone();
        }
        settings
    }

    /// Checks what the settings page sends before it is persisted. A relative
    /// save directory would resolve against whatever the process cwd happens to
    /// be, which for an app launched from Finder is `/`.
    pub fn validate(&self) -> Result<(), String> {
        if self.shortcut.trim().is_empty() {
            return Err("The capture shortcut is empty".into());
        }
        if self.default_font.trim().is_empty() {
            return Err("The default font is empty".into());
        }
        let mut seen: Vec<String> = Vec::new();
        for (mode, shortcut) in self.shortcuts() {
            let key = shortcut.to_lowercase();
            if seen.contains(&key) {
                return Err(format!(
                    "{} uses a shortcut already assigned: {shortcut}",
                    mode.label()
                ));
            }
            seen.push(key);
        }
        background::validate_all(&self.background_presets)?;
        if !Path::new(&self.save_dir).is_absolute() {
            return Err(format!(
                "The save location must be an absolute path: {}",
                self.save_dir
            ));
        }
        Ok(())
    }

    /// The shortcut assigned to a mode, empty when there is none.
    pub fn shortcut_for(&self, mode: CaptureMode) -> &str {
        match mode {
            CaptureMode::Area => &self.shortcut,
            CaptureMode::Window => &self.window_shortcut,
            CaptureMode::Fullscreen => &self.fullscreen_shortcut,
        }
        .trim()
    }

    /// Every assigned shortcut with the mode it starts. Unassigned ones are
    /// left out, so the caller registers exactly this list.
    pub fn shortcuts(&self) -> Vec<(CaptureMode, &str)> {
        CaptureMode::ALL
            .into_iter()
            .map(|mode| (mode, self.shortcut_for(mode)))
            .filter(|(_, shortcut)| !shortcut.is_empty())
            .collect()
    }

    pub fn save_dir(&self) -> PathBuf {
        PathBuf::from(&self.save_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn defaults() -> Settings {
        Settings::defaults(Path::new("/Users/me"))
    }

    #[test]
    fn missing_or_broken_file_gives_defaults() {
        assert_eq!(Settings::merge(&defaults(), None), defaults());
        assert_eq!(
            Settings::merge(&defaults(), Some(&json!([1, 2]))),
            defaults()
        );
    }

    #[test]
    fn stored_values_win_when_their_type_matches() {
        let stored = json!({
            "shortcut": "Alt+S",
            "saveDir": "/tmp/shots",
            "deleteKeys": false,
            "unknown": 1,
        });
        let merged = Settings::merge(&defaults(), Some(&stored));
        assert_eq!(merged.shortcut, "Alt+S");
        assert_eq!(merged.save_dir, "/tmp/shots");
        assert!(!merged.delete_keys);
        assert_eq!(merged.default_font, "Apple SD Gothic Neo");
    }

    // A string "false" would read as truthy in the page.
    #[test]
    fn wrong_types_empty_strings_and_relative_dirs_fall_back() {
        let stored = json!({ "deleteKeys": "false", "shortcut": "  ", "saveDir": "shots" });
        assert_eq!(Settings::merge(&defaults(), Some(&stored)), defaults());
    }

    #[test]
    fn validate_rejects_what_the_page_should_not_send() {
        assert!(defaults().validate().is_ok());
        let relative = Settings {
            save_dir: "shots".into(),
            ..defaults()
        };
        assert!(relative.validate().is_err());
        let blank = Settings {
            shortcut: "".into(),
            ..defaults()
        };
        assert!(blank.validate().is_err());
    }

    #[test]
    fn unassigned_shortcuts_are_left_out() {
        let modes: Vec<_> = defaults().shortcuts().into_iter().map(|(m, _)| m).collect();
        assert_eq!(modes, vec![CaptureMode::Area]);
        let all = Settings {
            window_shortcut: "Alt+W".into(),
            fullscreen_shortcut: " Alt+F ".into(),
            ..defaults()
        };
        assert_eq!(
            all.shortcuts(),
            vec![
                (CaptureMode::Area, "CommandOrControl+Shift+4"),
                (CaptureMode::Window, "Alt+W"),
                (CaptureMode::Fullscreen, "Alt+F"),
            ]
        );
    }

    #[test]
    fn validate_rejects_a_shortcut_used_twice() {
        let twice = Settings {
            fullscreen_shortcut: "commandorcontrol+shift+4".into(),
            ..defaults()
        };
        assert!(twice.validate().unwrap_err().contains("Capture Fullscreen"));
    }

    // Clearing a shortcut in the page must survive a reload.
    #[test]
    fn stored_presets_load_and_broken_ones_drop() {
        let stored = json!({ "backgroundPresets": [
            { "name": "Blog", "background": "g2", "padding": 64, "radius": 12,
              "shadow": true, "ratio": "16:9", "align": "center" },
            { "name": "broken" }
        ] });
        let merged = Settings::merge(&defaults(), Some(&stored));
        assert_eq!(merged.background_presets.len(), 1);
        assert_eq!(merged.background_presets[0].name, "Blog");
    }

    #[test]
    fn capture_sound_is_off_unless_stored() {
        assert!(!defaults().capture_sound);
        let stored = json!({ "captureSound": true });
        assert!(Settings::merge(&defaults(), Some(&stored)).capture_sound);
    }

    #[test]
    fn a_duplicate_shortcut_on_disk_keeps_the_save_dir() {
        let stored =
            json!({ "saveDir": "/tmp/shots", "windowShortcut": "CommandOrControl+Shift+4" });
        assert_eq!(
            Settings::merge(&defaults(), Some(&stored)).save_dir,
            "/tmp/shots"
        );
    }

    #[test]
    fn a_cleared_shortcut_stays_cleared() {
        let stored = json!({ "windowShortcut": "" });
        assert_eq!(
            Settings::merge(&defaults(), Some(&stored)).window_shortcut,
            ""
        );
    }
}
