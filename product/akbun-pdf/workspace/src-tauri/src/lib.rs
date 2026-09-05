mod ai;
mod commands;
mod files;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use pdf_core::DocumentStore;

#[derive(Default)]
pub struct AppState {
    store: Mutex<DocumentStore>,
    document_path: Mutex<Option<PathBuf>>,
    merge_store: Mutex<MergeStore>,
}

#[derive(Default)]
struct MergeStore {
    next_id: u64,
    files: HashMap<String, MergeInput>,
}

struct MergeInput {
    bytes: Vec<u8>,
}

impl AppState {
    fn store(&self) -> Result<MutexGuard<'_, DocumentStore>, String> {
        self.store
            .lock()
            .map_err(|_| "문서 상태 잠금에 실패했습니다.".into())
    }

    fn document_path(&self) -> Result<Option<PathBuf>, String> {
        self.document_path
            .lock()
            .map(|path| path.clone())
            .map_err(|_| "문서 경로 잠금에 실패했습니다.".into())
    }

    fn set_document_path(&self, path: PathBuf) -> Result<(), String> {
        *self
            .document_path
            .lock()
            .map_err(|_| "문서 경로 잠금에 실패했습니다.".to_string())? = Some(path);
        Ok(())
    }

    fn clear_document_path(&self) -> Result<(), String> {
        *self
            .document_path
            .lock()
            .map_err(|_| "문서 경로 잠금에 실패했습니다.".to_string())? = None;
        Ok(())
    }

    fn merge_store(&self) -> Result<MutexGuard<'_, MergeStore>, String> {
        self.merge_store
            .lock()
            .map_err(|_| "PDF 합치기 상태 잠금에 실패했습니다.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(AppState::default())
        .manage(ai::AiRuntime::default())
        .setup(|app| {
            ai::setup(app)?;
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::ai_start_server,
            ai::ai_send_rpc,
            ai::ai_stop_server,
            ai::ai_runtime_directory,
            ai::ai_load_settings,
            ai::ai_save_settings,
            ai::ai_list_conversations,
            ai::ai_create_conversation,
            ai::ai_load_conversation,
            ai::ai_append_message,
            ai::ai_rename_conversation,
            ai::ai_delete_conversation,
            ai::ai_save_page_image,
            ai::ai_clear_request,
            commands::get_document_state,
            commands::open_document,
            commands::complete_document_open,
            commands::fail_document_open,
            commands::reorder_page,
            commands::delete_page,
            commands::rotate_page,
            commands::upsert_annotation,
            commands::delete_annotation,
            commands::save_document,
            commands::save_document_as,
            commands::add_merge_files,
            commands::save_merged_document,
            commands::clear_merge_files,
            commands::close_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running akbun-pdf");
}
