//! settings.json on disk and the global capture shortcuts it names.

use crate::capture;
use screenshot_core::settings::Settings;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    /// Same file the Electron build used, ~/Library/Application Support/
    /// akbun-screenshot/settings.json, so settings survive the move to Tauri.
    /// Tauri's own config dir is named after the bundle identifier instead.
    pub fn load(app: &AppHandle) -> tauri::Result<Self> {
        let path = app
            .path()
            .data_dir()?
            .join("akbun-screenshot")
            .join("settings.json");
        let defaults = Settings::defaults(&app.path().home_dir()?);
        let stored = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok());
        let current = Mutex::new(Settings::merge(&defaults, stored.as_ref()));
        Ok(Self { path, current })
    }

    pub fn get(&self) -> Settings {
        self.current
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn save(&self, next: Settings) -> Result<(), String> {
        let text = serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?;
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&self.path, text).map_err(|e| format!("{}: {e}", self.path.display()))?;
        *self.current.lock().unwrap_or_else(|p| p.into_inner()) = next;
        Ok(())
    }
}

/// Replaces every registered shortcut with the ones these settings assign.
/// Registering is also the validation: a string the parser or the system
/// refuses comes back as Err. One that fails does not stop the rest, so a
/// launch with one taken shortcut still gets the other two.
pub fn register_shortcuts(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    let mut first_error = None;
    for (mode, shortcut) in settings.shortcuts() {
        let registered = shortcuts.on_shortcut(shortcut, move |app, _, event| {
            if event.state == ShortcutState::Pressed {
                capture::start(app, mode);
            }
        });
        if let Err(error) = registered {
            first_error.get_or_insert(format!("Cannot register shortcut {shortcut}: {error}"));
        }
    }
    first_error.map_or(Ok(()), Err)
}
