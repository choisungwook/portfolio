//! The whole IPC surface. The page picks paths with native dialogs and every
//! command receives a path plus data, so nothing here blocks on UI.

use base64::Engine;
use makepresentation_deck::{pdf, pptx, Deck};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs::File;
use std::io::{BufWriter, Write};

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
