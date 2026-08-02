//! The whole IPC surface. The page picks paths with native dialogs and every
//! command receives a path plus data, so nothing here blocks on UI.

use base64::Engine;
use serde::Deserialize;
use makepresentation_deck::{pdf, pptx, Deck};
use std::fs::File;
use std::io::BufWriter;

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
