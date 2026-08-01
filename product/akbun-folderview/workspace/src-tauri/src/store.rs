// Where the library and the settings live between runs.
//
// Both files sit under the Tauri app config directory, which on Windows is
// %APPDATA%\<identifier>. Not Program Files: that directory is read only for a
// normal user, so a write there fails or lands in a per-user shadow copy the
// app cannot find again. See adr/2026-08-settings-in-appdata.md.

use folderview_library::{Library, Settings};
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
/// direct write would leave a truncated library.json, and every tag and rating
/// in it would be gone. Rename is atomic, so the old file survives until the
/// new one is complete.
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

pub fn load_library(app: &AppHandle) -> Library {
    read_json(app, "library.json")
}

pub fn save_library(app: &AppHandle, library: &Library) -> Result<(), String> {
    write_json(app, "library.json", library)
}

/// Where cached thumbnails live. Created on demand, so clearing the cache is
/// just removing the folder.
pub fn thumbs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("no config directory: {error}"))?
        .join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    Ok(dir)
}

pub fn load_settings(app: &AppHandle) -> Settings {
    read_json(app, "settings.json")
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    write_json(app, "settings.json", settings)
}
