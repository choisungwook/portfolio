use pdf_core::DocumentState;
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_document_state(state: State<'_, AppState>) -> DocumentState {
    state.document()
}
