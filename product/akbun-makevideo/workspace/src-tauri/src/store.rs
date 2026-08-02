//! Where the settings live between runs.
//!
//! The project itself is a file the user picks, so only the application
//! settings land here: the app config directory, which is
//! ~/Library/Application Support/io.akbun.makevideo on macOS.

use crate::commands::Settings;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("no config directory: {error}"))?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    Ok(dir.join(name))
}

pub fn data_dir(app: &AppHandle) -> String {
    app.path()
        .app_config_dir()
        .map(|dir| dir.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Write to a temp file and rename over the target. A crash halfway through a
/// direct write would leave a truncated settings.json; rename is atomic, so the
/// old file survives until the new one is complete.
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
