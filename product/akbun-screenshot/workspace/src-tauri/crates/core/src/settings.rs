use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Accelerator string, e.g. CommandOrControl+Shift+4.
    pub shortcut: String,
    pub save_dir: String,
    /// Ships with macOS and covers Korean and English, so the editor renders
    /// both without bundling a font.
    pub default_font: String,
    /// Whether Delete and Backspace remove the selected shape in the editor. A
    /// setting because Backspace is muscle memory for "go back".
    pub delete_keys: bool,
}

impl Settings {
    pub fn defaults(home: &Path) -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+4".into(),
            save_dir: home
                .join("Pictures")
                .join("akbun-screenshot")
                .to_string_lossy()
                .into(),
            default_font: "Apple SD Gothic Neo".into(),
            delete_keys: true,
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
        if settings.validate().is_err() {
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
        if !Path::new(&self.save_dir).is_absolute() {
            return Err(format!(
                "The save location must be an absolute path: {}",
                self.save_dir
            ));
        }
        Ok(())
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
}
