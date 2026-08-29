use gitdesktop_core::{AppSettings, RepoEntry};
use serde::{de::DeserializeOwned, Serialize};
use std::{env, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(name))
        .map_err(|error| error.to_string())
}

fn load_json<T: DeserializeOwned>(app: &AppHandle, name: &str) -> Result<T, String> {
    let path = data_file(app, name)?;
    let contents = fs::read_to_string(&path)
        .or_else(|_| fs::read_to_string(legacy_data_file(name)?))
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn legacy_data_file(name: &str) -> std::io::Result<PathBuf> {
    #[cfg(target_os = "macos")]
    let directory = env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join("Library/Application Support/akbun-gitdesktop"));

    #[cfg(windows)]
    let directory = env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|app_data| app_data.join("akbun-gitdesktop"));

    #[cfg(all(unix, not(target_os = "macos")))]
    let directory = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("HOME")
                .map(PathBuf::from)
                .map(|home| home.join(".config"))
        })
        .map(|config| config.join("akbun-gitdesktop"));

    directory.map(|path| path.join(name)).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "legacy app data directory not found",
        )
    })
}

fn save_json<T: Serialize>(app: &AppHandle, name: &str, value: &T) -> Result<(), String> {
    let path = data_file(app, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let contents = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

pub fn load_repos(app: &AppHandle) -> Vec<RepoEntry> {
    load_json(app, "repos.json").unwrap_or_default()
}

pub fn save_repos(app: &AppHandle, repos: &[RepoEntry]) -> Result<(), String> {
    save_json(app, "repos.json", &repos)
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let mut settings: AppSettings = load_json(app, "settings.json").unwrap_or_default();
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") {
        settings.theme = "system".into();
    }
    settings
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    save_json(app, "settings.json", settings)
}
