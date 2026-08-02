//! Where settings live between runs.
//!
//! settings.json sits next to the recordings, in the folder under the home
//! Documents folder, rather than in the platform's application data folder.
//! See adr/2026-08-settings-next-to-recordings.md.

use makepodcast_recorder::{default_project_dir, Settings};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

/// The home folder, or the current directory if the platform will not say. The
/// fallback never happens on a desktop, and returning a path is better than
/// refusing to start over a folder lookup.
fn home(app: &AppHandle) -> PathBuf {
    app.path()
        .home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// `~/Documents/akbun-makepodcast`, whatever the user later chooses for
/// recordings. settings.json stays here so that moving the recording folder
/// does not hide the settings that say where it moved to.
pub fn app_dir(app: &AppHandle) -> PathBuf {
    default_project_dir(&home(app))
}

/// Where recordings go: the setting if there is one, the default otherwise.
pub fn project_dir(app: &AppHandle, settings: &Settings) -> PathBuf {
    settings.resolved_project_dir(&home(app))
}

/// A missing or broken file is first run, not a crash. Defaults either way.
pub fn load_settings(app: &AppHandle) -> Settings {
    std::fs::read_to_string(app_dir(app).join(SETTINGS_FILE))
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .unwrap_or_default()
        .normalized()
}

/// Write to a temp file and rename over the target. A crash halfway through a
/// direct write would leave a truncated settings.json, and the next start would
/// silently forget the chosen interface.
pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let dir = app_dir(app);
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    let target = dir.join(SETTINGS_FILE);
    let temp = target.with_extension("tmp");
    let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    std::fs::write(&temp, text).map_err(|error| format!("cannot write {temp:?}: {error}"))?;
    std::fs::rename(&temp, &target).map_err(|error| format!("cannot replace {target:?}: {error}"))
}
