//! The whole IPC surface. The page picks paths with native dialogs and every
//! command receives a path plus data, so nothing here blocks on UI.

use base64::Engine;
use makepresentation_deck::{pdf, pptx, Deck};
use serde::Deserialize;
use serde_json::Value;
use makepresentation_desktop::{fingerprint, write_atomic, Tracker};
use std::collections::BTreeSet;
use std::fs::{create_dir_all, read_to_string, File};
use std::io::{BufWriter, Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    database
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[tauri::command]
pub fn open_deck(tracker: State<Mutex<Tracker>>, path: String) -> Result<Deck, String> {
    // Taken before reading: a write that lands during the read then shows up as a change.
    let disk = fingerprint(std::path::Path::new(&path));
    let file = File::open(&path).map_err(|e| format!("cannot open {path}: {e}"))?;
    let deck = pptx::read(file)?;
    tracker
        .lock()
        .map_err(|e| e.to_string())?
        .synced_to(std::path::Path::new(&path), disk);
    Ok(deck)
}

/// "Keep my version": the next save overwrites whatever is on disk now.
#[tauri::command]
pub fn acknowledge_disk_change(tracker: State<Mutex<Tracker>>) -> Result<(), String> {
    let mut tracker = tracker.lock().map_err(|e| e.to_string())?;
    if let Some(path) = tracker.path().map(PathBuf::from) {
        tracker.synced_to(&path, fingerprint(&path));
    }
    Ok(())
}

#[tauri::command]
pub fn read_image_file(path: String) -> Result<String, String> {
    let extension = std::path::Path::new(&path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => return Err("Select an image file (PNG, JPEG, GIF, SVG, WebP, or BMP).".into()),
    };
    let file = File::open(&path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take(10_000_001)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > 10_000_000 {
        return Err("Image files must be 10 MB or smaller.".into());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn save_deck(
    app: AppHandle,
    tracker: State<Mutex<Tracker>>,
    path: String,
    deck: Deck,
) -> Result<bool, String> {
    let target = std::path::Path::new(&path);
    // Held through the write so the poller never sees our own file as a change.
    let mut tracker = tracker.lock().map_err(|e| e.to_string())?;
    if tracker.conflicts(target, fingerprint(target)) {
        return Ok(false);
    }
    let written = write_atomic(target, |file| pptx::write(&deck, BufWriter::new(file)))?;
    tracker.synced_to(target, written);
    crate::documents::remember_saved_document(&app, target)?;
    Ok(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageImage {
    /// A canvas.toDataURL("image/jpeg") string.
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn export_pdf(path: String, pages: Vec<PageImage>) -> Result<(), String> {
    let mut jpegs = Vec::with_capacity(pages.len());
    for page in pages {
        let b64 = page
            .data_url
            .split_once("base64,")
            .map(|(_, rest)| rest)
            .ok_or("page image is not a data URL")?;
        let data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("bad page image: {e}"))?;
        jpegs.push(pdf::JpegPage {
            data,
            width: page.width,
            height: page.height,
        });
    }
    let file = File::create(&path).map_err(|e| format!("cannot write {path}: {e}"))?;
    pdf::write(&jpegs, BufWriter::new(file))
}

#[tauri::command]
pub fn save_png(path: String, data_url: String) -> Result<(), String> {
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("image is not a PNG data URL")?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("bad PNG image: {e}"))?;
    let mut file = File::create(&path).map_err(|e| format!("cannot write {path}: {e}"))?;
    file.write_all(&data)
        .map_err(|e| format!("cannot write {path}: {e}"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::documents::profile_directory(app)?.join("settings.json"))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Option<Value>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents =
        read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|e| format!("cannot parse {}: {e}", path.display()))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    let directory = path
        .parent()
        .ok_or_else(|| format!("cannot locate parent of {}", path.display()))?;
    create_dir_all(directory).map_err(|e| format!("cannot create {}: {e}", directory.display()))?;
    let file = File::create(&path).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer_pretty(&mut writer, &settings)
        .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    writer
        .write_all(b"\n")
        .and_then(|_| writer.flush())
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}
