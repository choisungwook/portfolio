//! The editor's Background tool presets, kept in settings.json.

use crate::settings::SettingsStore;
use crate::windows::EDITOR;
use screenshot_core::background::{self, BackgroundPreset};
use tauri::{State, WebviewWindow};

/// Replaces the saved list and returns it, so the page redraws from what was
/// actually stored.
#[tauri::command]
pub fn background_presets_save(
    window: WebviewWindow,
    store: State<'_, SettingsStore>,
    presets: Vec<BackgroundPreset>,
) -> Result<Vec<BackgroundPreset>, String> {
    if !window.label().starts_with(EDITOR) {
        return Err("only the editor saves background presets".into());
    }
    background::validate_all(&presets)?;
    let mut next = store.get();
    next.background_presets = presets;
    store.save(next.clone())?;
    Ok(next.background_presets)
}
