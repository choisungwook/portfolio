// Where the settings live between runs: the Tauri app config directory,
// ~/Library/Application Support/io.akbun.awsviewer on macOS.
//
// Only UI state is stored here — the selected profile name and the TLS
// toggle. AWS state stays in ~/.aws where the CLI keeps it: profiles are read
// from ~/.aws/config and tokens from ~/.aws/sso/cache, so this app and the
// CLI always see the same session.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub profile: Option<String>,
    /// Skips TLS certificate verification on AWS calls. Off by default; the
    /// Settings tab is the only place that turns it on.
    pub insecure_tls: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            profile: None,
            insecure_tls: false,
        }
    }
}

fn file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("no config directory: {error}"))?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    Ok(dir.join(name))
}

/// Write to a temp file and rename over the target, so a crash halfway
/// through never leaves a truncated settings file behind.
fn write_json<T: serde::Serialize>(app: &AppHandle, name: &str, value: &T) -> Result<(), String> {
    let target = file_path(app, name)?;
    let temp = target.with_extension("tmp");
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    std::fs::write(&temp, text).map_err(|error| format!("cannot write {temp:?}: {error}"))?;
    std::fs::rename(&temp, &target).map_err(|error| format!("cannot replace {target:?}: {error}"))
}

/// A missing or broken file is first run, not a crash. Defaults either way.
fn read_json<T: serde::de::DeserializeOwned + Default>(app: &AppHandle, name: &str) -> T {
    file_path(app, name)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn load_settings(app: &AppHandle) -> Settings {
    read_json(app, "settings.json")
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    write_json(app, "settings.json", settings)
}
