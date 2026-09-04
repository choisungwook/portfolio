use std::fs;
use std::path::Path;

use pdf_core::{preservation_report, DocumentState, OpenDocument, OutlineItem, PreservationReport};
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_document_state(state: State<'_, AppState>) -> Result<DocumentState, String> {
    Ok(state.store()?.state())
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<OpenDocument, String> {
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let title = Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.pdf")
        .to_owned();
    state.store()?.open(title, bytes)
}

#[tauri::command]
pub fn complete_document_open(
    document_id: String,
    page_count: u32,
    outline: Vec<OutlineItem>,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state.store()?.complete(&document_id, page_count, outline)
}

#[tauri::command]
pub fn fail_document_open(
    document_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state.store()?.fail(&document_id, message)
}

#[tauri::command]
pub fn save_document(
    document_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<PreservationReport, String> {
    let bytes = {
        let store = state.store()?;
        store.bytes(&document_id)?.to_vec()
    };
    fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    let saved = fs::read(path).map_err(|error| error.to_string())?;
    Ok(preservation_report(&bytes, &saved))
}

#[tauri::command]
pub fn close_document(state: State<'_, AppState>) -> Result<DocumentState, String> {
    Ok(state.store()?.close())
}
