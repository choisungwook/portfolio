//! The whole IPC surface. The page picks paths with native dialogs and every
//! command receives a path plus data, so nothing here blocks on UI.

use base64::Engine;
use makepresentation_deck::{pdf, pptx, Deck};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs::{create_dir_all, read_to_string, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
pub fn open_deck(path: String) -> Result<Deck, String> {
    let file = File::open(&path).map_err(|e| format!("cannot open {path}: {e}"))?;
    pptx::read(file)
}

#[tauri::command]
pub fn save_deck(path: String, deck: Deck) -> Result<(), String> {
    let file = File::create(&path).map_err(|e| format!("cannot write {path}: {e}"))?;
    pptx::write(&deck, BufWriter::new(file))
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
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("settings.json"))
        .map_err(|e| format!("cannot locate app data directory: {e}"))
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
