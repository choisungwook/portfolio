//! Where the settings live between runs.
//!
//! The project itself is a file the user picks, so only the application
//! settings land here: the app config directory, which is
//! ~/Library/Application Support/io.akbun.makevideo on macOS.

use crate::commands::Settings;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const ERROR_LOG: &str = "errors.log";

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

pub fn log_dir(app: &AppHandle, settings: &Settings) -> PathBuf {
    let configured = settings.log_dir.trim();
    if configured.is_empty() {
        return app
            .path()
            .app_log_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
    }
    if configured == "~" || configured.starts_with("~/") || configured.starts_with("~\\") {
        if let Ok(home) = app.path().home_dir() {
            return home.join(configured[1..].trim_start_matches(|ch| ch == '/' || ch == '\\'));
        }
    }
    PathBuf::from(configured)
}

pub fn prepare_log_dir(app: &AppHandle, settings: &Settings) -> Result<PathBuf, String> {
    let dir = log_dir(app, settings);
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot create log directory {dir:?}: {error}"))?;
    Ok(dir)
}

fn rotation_bytes(settings: &Settings) -> u64 {
    let multiplier = if settings.log_rotation_unit.eq_ignore_ascii_case("kb") {
        1024
    } else {
        1024 * 1024
    };
    settings.log_rotation_size.max(1).saturating_mul(multiplier)
}

pub fn append_error(
    app: &AppHandle,
    settings: &Settings,
    source: &str,
    message: &str,
) -> Result<(), String> {
    let dir = prepare_log_dir(app, settings)?;
    let active = dir.join(ERROR_LOG);
    let archived = dir.join("errors.log.1");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let record = format!("[{timestamp}] {source}: {}\n", message.trim());
    let current_size = active.metadata().map(|meta| meta.len()).unwrap_or(0);

    if current_size > 0
        && current_size.saturating_add(record.len() as u64) > rotation_bytes(settings)
    {
        if archived.exists() {
            std::fs::remove_file(&archived)
                .map_err(|error| format!("cannot remove old error log {archived:?}: {error}"))?;
        }
        std::fs::rename(&active, &archived)
            .map_err(|error| format!("cannot rotate error log {active:?}: {error}"))?;
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&active)
        .map_err(|error| format!("cannot open error log {active:?}: {error}"))?;
    file.write_all(record.as_bytes())
        .map_err(|error| format!("cannot write error log {active:?}: {error}"))
}

pub fn recent_error_log(
    app: &AppHandle,
    settings: &Settings,
    lines: usize,
) -> Result<String, String> {
    let path = log_dir(app, settings).join(ERROR_LOG);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("cannot read error log {path:?}: {error}")),
    };
    Ok(text
        .lines()
        .rev()
        .take(lines)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n"))
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
