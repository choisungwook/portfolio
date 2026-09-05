use std::fs;
use std::path::{Path, PathBuf};

use pdf_core::{
    inspect_pdf, merge_documents, AnnotationDraft, DocumentState, MergeReport, OpenDocument,
    OutlineItem, SaveResult,
};
use serde::Serialize;
use tauri::State;

use crate::files::atomic_write;
use crate::{AppState, MergeInput};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFile {
    id: String,
    title: String,
    page_count: u32,
    error_message: Option<String>,
}

#[tauri::command]
pub fn get_document_state(state: State<'_, AppState>) -> Result<DocumentState, String> {
    Ok(state.store()?.state())
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<OpenDocument, String> {
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let title = file_title(Path::new(&path));
    let opened = state.store()?.open(title, bytes)?;
    state.set_document_path(PathBuf::from(path))?;
    Ok(opened)
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
    state.clear_document_path()?;
    state.store()?.fail(&document_id, message)
}

#[tauri::command]
pub fn reorder_page(
    document_id: String,
    from_page: u32,
    to_page: u32,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state
        .store()?
        .reorder_page(&document_id, from_page, to_page)
}

#[tauri::command]
pub fn delete_page(
    document_id: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state.store()?.delete_page(&document_id, page)
}

#[tauri::command]
pub fn rotate_page(
    document_id: String,
    page: u32,
    degrees: i32,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state.store()?.rotate_page(&document_id, page, degrees)
}

#[tauri::command]
pub fn upsert_annotation(
    document_id: String,
    annotation: AnnotationDraft,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state.store()?.upsert_annotation(&document_id, annotation)
}

#[tauri::command]
pub fn delete_annotation(
    document_id: String,
    annotation_id: String,
    state: State<'_, AppState>,
) -> Result<DocumentState, String> {
    state
        .store()?
        .delete_annotation(&document_id, &annotation_id)
}

#[tauri::command]
pub fn save_document(
    document_id: String,
    state: State<'_, AppState>,
) -> Result<SaveResult, String> {
    let path = state
        .document_path()?
        .ok_or_else(|| "현재 문서의 저장 경로가 없습니다.".to_string())?;
    save_to_path(&document_id, &path, &state)
}

#[tauri::command]
pub fn save_document_as(
    document_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<SaveResult, String> {
    let path = PathBuf::from(path);
    let result = save_to_path(&document_id, &path, &state)?;
    state.set_document_path(path)?;
    Ok(result)
}

#[tauri::command]
pub fn add_merge_files(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MergeFile>, String> {
    let mut merge = state.merge_store()?;
    Ok(paths
        .into_iter()
        .map(|path| {
            merge.next_id += 1;
            let id = format!("merge-{}", merge.next_id);
            let title = file_title(Path::new(&path));
            match fs::read(&path).and_then(|bytes| {
                inspect_pdf(&bytes)
                    .map(|page_count| (bytes, page_count))
                    .map_err(std::io::Error::other)
            }) {
                Ok((bytes, page_count)) => {
                    merge.files.insert(id.clone(), MergeInput { bytes });
                    MergeFile {
                        id,
                        title,
                        page_count,
                        error_message: None,
                    }
                }
                Err(error) => MergeFile {
                    id,
                    title,
                    page_count: 0,
                    error_message: Some(error.to_string()),
                },
            }
        })
        .collect())
}

#[tauri::command]
pub fn save_merged_document(
    file_ids: Vec<String>,
    path: String,
    state: State<'_, AppState>,
) -> Result<MergeReport, String> {
    let inputs = {
        let merge = state.merge_store()?;
        file_ids
            .iter()
            .map(|id| {
                merge
                    .files
                    .get(id)
                    .map(|input| input.bytes.clone())
                    .ok_or_else(|| "합칠 PDF 정보를 찾을 수 없습니다.".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?
    };
    let (bytes, report) = merge_documents(&inputs)?;
    atomic_write(Path::new(&path), &bytes)?;
    Ok(report)
}

#[tauri::command]
pub fn clear_merge_files(state: State<'_, AppState>) -> Result<(), String> {
    state.merge_store()?.files.clear();
    Ok(())
}

#[tauri::command]
pub fn close_document(state: State<'_, AppState>) -> Result<DocumentState, String> {
    state.clear_document_path()?;
    Ok(state.store()?.close())
}

fn save_to_path(
    document_id: &str,
    path: &Path,
    state: &State<'_, AppState>,
) -> Result<SaveResult, String> {
    let (bytes, report) = state.store()?.rendered_bytes(document_id)?;
    atomic_write(path, &bytes)?;
    let document_state = state.store()?.commit_saved(document_id, bytes.clone())?;
    Ok(SaveResult {
        state: document_state,
        bytes,
        report,
    })
}

fn file_title(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.pdf")
        .to_owned()
}
