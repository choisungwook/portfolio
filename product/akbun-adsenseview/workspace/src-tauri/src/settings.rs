//! Files under the app config directory. On macOS that is
//! ~/Library/Application Support/io.akbun.adsenseview/.
//!
//! - client_secret.json: downloaded from GCP by hand, never written here
//! - token.json: the OAuth refresh and access token
//! - settings.json: settle_days and the account currency
//! - cache.sqlite: the daily rows

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DEFAULT_SETTLE_DAYS: i64 = 7;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
  /// Days before today whose numbers AdSense may still change. They are
  /// always refetched. Change the default here or edit settings.json.
  pub settle_days: i64,
  pub currency: Option<String>,
}

impl Default for Settings {
  fn default() -> Self {
    Settings { settle_days: DEFAULT_SETTLE_DAYS, currency: None }
  }
}

pub fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|error| format!("no config directory: {error}"))?;
  std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
  Ok(dir)
}

pub fn load(dir: &std::path::Path) -> Settings {
  std::fs::read_to_string(dir.join("settings.json"))
    .ok()
    .and_then(|text| serde_json::from_str(&text).ok())
    .unwrap_or_default()
}

pub fn save(dir: &std::path::Path, settings: &Settings) -> Result<(), String> {
  let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
  std::fs::write(dir.join("settings.json"), text).map_err(|error| error.to_string())
}
