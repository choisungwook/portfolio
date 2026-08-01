// Everything the window can ask the operating system to do.
//
// The split is deliberate. Picking a folder and confirming a delete happen in
// the page through the dialog plugin, because a blocking native dialog inside a
// command is a threading hazard. Everything that touches the file system
// happens here, because the user's photos live anywhere on the disk and the
// alternative would be granting the webview an unrestricted open-path scope.

use folderview_library::{self as library, Entry, Library, Root, Settings};
use crate::store;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    pub library: Mutex<Library>,
    pub settings: Mutex<Settings>,
}

/// Everything the page needs on load, in one round trip.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub roots: Vec<Root>,
    pub entries: Vec<Entry>,
    pub settings: Settings,
    pub version: String,
    pub data_dir: String,
    pub thumbs_dir: String,
}

/// Let the webview read this folder through the asset protocol.
///
/// A static scope in tauri.conf.json cannot express this: the photos are
/// wherever the user keeps them, and a bare "**" does not match an absolute
/// path, so the config would have to grant the whole disk. Granting each added
/// folder instead means the page can read exactly what was added and nothing
/// else. The grant lives in memory only, which is why it is re-applied from the
/// stored library on every start.
pub fn allow_asset_dir(app: &AppHandle, path: &str) {
    let _ = app.asset_protocol_scope().allow_directory(path, true);
}

pub fn allow_asset_file(app: &AppHandle, path: &str) {
    let _ = app.asset_protocol_scope().allow_file(path);
}

fn snapshot(app: &AppHandle, state: &State<AppState>) -> Snapshot {
    let library = state.library.lock().unwrap();
    Snapshot {
        roots: library.roots.clone(),
        entries: library.entries.clone(),
        settings: state.settings.lock().unwrap().clone(),
        version: app.package_info().version.to_string(),
        data_dir: store::data_dir(app),
        thumbs_dir: store::thumbs_dir(app)
            .map(|dir| dir.to_string_lossy().to_string())
            .unwrap_or_default(),
    }
}

/// The page holds the whole library, so every mutation answers with the whole
/// library. It is a few hundred kilobytes at worst and it removes a class of
/// bug where the two copies drift apart.
fn persist(app: &AppHandle, state: &State<AppState>) -> Result<Snapshot, String> {
    store::save_library(app, &state.library.lock().unwrap())?;
    Ok(snapshot(app, state))
}

#[tauri::command]
pub fn get_library(app: AppHandle, state: State<AppState>) -> Snapshot {
    snapshot(&app, &state)
}

#[tauri::command]
pub fn add_folder(app: AppHandle, state: State<AppState>, path: String) -> Result<Snapshot, String> {
    allow_asset_dir(&app, &path);
    let scanned = library::scan_folder(Path::new(&path));
    {
        let mut lib = state.library.lock().unwrap();
        if !lib.roots.iter().any(|root| root.path == path) {
            lib.roots.push(Root { path });
        }
        let known: std::collections::HashSet<String> =
            lib.entries.iter().map(|entry| entry.path.clone()).collect();
        // mergeScan carries over the rating and tags of anything already known,
        // which matters when a folder is added a second time after a removal.
        let merged = library::merge_scan(&lib.entries, scanned);
        lib.entries
            .extend(merged.into_iter().filter(|entry| !known.contains(&entry.path)));
    }
    persist(&app, &state)
}

#[tauri::command]
pub fn add_files(
    app: AppHandle,
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Snapshot, String> {
    for path in &paths {
        allow_asset_file(&app, path);
    }
    {
        let mut lib = state.library.lock().unwrap();
        let known: std::collections::HashSet<String> =
            lib.entries.iter().map(|entry| entry.path.clone()).collect();
        let fresh: Vec<Entry> = paths
            .iter()
            .filter(|path| !known.contains(*path))
            .filter_map(|path| library::make_entry(Path::new(path)))
            .collect();
        lib.entries.extend(fresh);
    }
    persist(&app, &state)
}

/// Walk every root again and drop files that are gone. Files added one at a
/// time sit under no root, so they are carried across by existence check
/// rather than by rescan.
#[tauri::command]
pub fn rescan(app: AppHandle, state: State<AppState>) -> Result<Snapshot, String> {
    let roots: Vec<String> = state
        .library
        .lock()
        .unwrap()
        .roots
        .iter()
        .map(|root| root.path.clone())
        .collect();

    let mut scanned = Vec::new();
    for root in &roots {
        scanned.extend(library::scan_folder(Path::new(root)));
    }

    {
        let mut lib = state.library.lock().unwrap();
        let loose: Vec<Entry> = lib
            .entries
            .iter()
            .filter(|entry| !roots.iter().any(|root| library::is_under(&entry.path, root)))
            .filter(|entry| Path::new(&entry.path).exists())
            .cloned()
            .collect();

        let mut merged = library::merge_scan(&lib.entries, scanned);
        merged.extend(loose);
        lib.entries = merged;
    }
    persist(&app, &state)
}

/// Removing a folder removes its files from the library. The files themselves
/// are not touched.
#[tauri::command]
pub fn remove_root(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<Snapshot, String> {
    {
        let mut lib = state.library.lock().unwrap();
        lib.roots.retain(|root| root.path != path);
        lib.entries.retain(|entry| !library::is_under(&entry.path, &path));
    }
    persist(&app, &state)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryPatch {
    pub rating: Option<u8>,
    pub favorite: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn update_entry(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    patch: EntryPatch,
) -> Result<Snapshot, String> {
    {
        let mut lib = state.library.lock().unwrap();
        let entry = lib
            .entries
            .iter_mut()
            .find(|entry| entry.path == path)
            .ok_or("no such entry")?;
        if let Some(rating) = patch.rating {
            entry.rating = rating.min(5);
        }
        if let Some(favorite) = patch.favorite {
            entry.favorite = favorite;
        }
        if let Some(tags) = patch.tags {
            entry.tags = tags;
        }
    }
    persist(&app, &state)
}

#[tauri::command]
pub fn rename_entry(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    new_name: String,
) -> Result<Snapshot, String> {
    let source = PathBuf::from(&path);
    let parent = source.parent().ok_or("file has no folder")?;

    // A new name is text the user typed. Without this it could carry a
    // separator or "..", and the rename would move the file somewhere else
    // entirely rather than renaming it in place.
    if new_name.is_empty() || new_name.contains(['/', '\\']) || new_name == ".." {
        return Err("a name cannot be empty or contain a path separator".into());
    }

    let target = parent.join(&new_name);
    if target.exists() {
        return Err(format!("{new_name} already exists"));
    }
    std::fs::rename(&source, &target).map_err(|error| error.to_string())?;

    {
        let mut lib = state.library.lock().unwrap();
        if let Some(entry) = lib.entries.iter_mut().find(|entry| entry.path == path) {
            entry.path = target.to_string_lossy().to_string();
            entry.name = new_name;
        }
    }
    persist(&app, &state)
}

/// Delete moves the file to the Recycle Bin rather than unlinking it, so a
/// mis-click is recoverable outside this app. The confirmation happens in the
/// page before this is called.
#[tauri::command]
pub fn delete_entry(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<Snapshot, String> {
    trash::delete(&path).map_err(|error| error.to_string())?;
    state
        .library
        .lock()
        .unwrap()
        .entries
        .retain(|entry| entry.path != path);
    persist(&app, &state)
}

#[tauri::command]
pub fn open_entry(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reveal_entry(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn copy_path(app: AppHandle, path: String) -> Result<(), String> {
    app.clipboard()
        .write_text(path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = store::data_dir(&app);
    app.opener()
        .open_path(dir, None::<&str>)
        .map_err(|error| error.to_string())
}

/// The page generates thumbnails with its own codecs and hands the JPEG bytes
/// here, so Rust needs no image library and the formats that display are
/// exactly the formats that thumbnail.
#[tauri::command]
pub fn save_thumb(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    // The name is computed in the page. Reject anything that could step out
    // of the thumbs folder.
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return Err("bad thumbnail name".into());
    }
    let dir = store::thumbs_dir(&app)?;
    std::fs::write(dir.join(&name), bytes).map_err(|error| error.to_string())
}

/// Refresh Thumbnails in the page. Dropping the whole folder is also what
/// cleans up thumbnails orphaned by renames and deletes.
#[tauri::command]
pub fn clear_thumbs(app: AppHandle) -> Result<(), String> {
    let dir = store::thumbs_dir(&app)?;
    std::fs::remove_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    store::save_settings(&app, &settings)?;
    // The window theme has to follow the setting too, or the native menus and
    // the title bar stay on the old one.
    apply_theme(&app, &settings.theme);
    *state.settings.lock().unwrap() = settings.clone();
    Ok(settings)
}

/// None means follow the operating system, which is also what leaves
/// prefers-color-scheme inside the webview tracking the system setting.
pub fn apply_theme(app: &AppHandle, theme: &str) {
    let wanted = match theme {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(wanted);
    }
}
