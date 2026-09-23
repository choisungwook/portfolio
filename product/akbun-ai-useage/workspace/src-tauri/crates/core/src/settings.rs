//! Settings are a JSON file the user edits directly, opened from the tray
//! menu. It is reread on every refresh, so an edit applies without a restart.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub refresh_minutes: u64,
    pub claude: Claude,
    pub codex: Toggle,
    pub kiro: Kiro,
    pub anthropic_admin: AdminKey,
    pub openai_admin: AdminKey,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Claude {
    pub enabled: bool,
    pub limits: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Toggle {
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Kiro {
    pub enabled: bool,
    pub command: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AdminKey {
    pub api_key: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_minutes: 5,
            claude: Claude::default(),
            codex: Toggle::default(),
            kiro: Kiro::default(),
            anthropic_admin: AdminKey::default(),
            openai_admin: AdminKey::default(),
        }
    }
}

impl Default for Claude {
    fn default() -> Self {
        Self {
            enabled: true,
            limits: false,
        }
    }
}

impl Default for Toggle {
    fn default() -> Self {
        Self { enabled: true }
    }
}

impl Default for Kiro {
    fn default() -> Self {
        Self {
            enabled: true,
            command: "kiro-cli".into(),
        }
    }
}

/// Writes the defaults on first run so there is a file to open. The file can
/// hold admin keys, so it is readable by the owner only.
pub fn load(file: &Path) -> Settings {
    if !file.exists() {
        let defaults = Settings::default();
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let text = serde_json::to_string_pretty(&defaults).unwrap_or_default() + "\n";
        let _ = write_private(file, &text);
        return defaults;
    }
    fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_private(file: &Path, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(file)?.write_all(text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("usage-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("settings.json")
    }

    #[test]
    fn writes_defaults_on_first_run_owner_only() {
        let file = temp_file("first");
        assert_eq!(load(&file), Settings::default());
        assert!(file.exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(file.parent().unwrap()).unwrap();
    }

    #[test]
    fn fills_missing_keys_and_survives_broken_json() {
        let file = temp_file("partial");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(
            &file,
            r#"{"claude":{"limits":true},"openaiAdmin":{"apiKey":"k"}}"#,
        )
        .unwrap();
        let settings = load(&file);
        assert!(settings.claude.limits && settings.claude.enabled);
        assert_eq!(settings.openai_admin.api_key, "k");
        assert_eq!(settings.refresh_minutes, 5);

        fs::write(&file, "{ broken").unwrap();
        assert_eq!(load(&file), Settings::default());
        fs::remove_dir_all(file.parent().unwrap()).unwrap();
    }
}
