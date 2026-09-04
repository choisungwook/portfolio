mod commands;

use std::sync::{Mutex, MutexGuard};

use pdf_core::DocumentStore;

#[derive(Default)]
pub struct AppState {
    store: Mutex<DocumentStore>,
}

impl AppState {
    fn store(&self) -> Result<MutexGuard<'_, DocumentStore>, String> {
        self.store
            .lock()
            .map_err(|_| "문서 상태 잠금에 실패했습니다.".into())
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
        .setup(|app| {
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
            commands::get_document_state,
            commands::open_document,
            commands::complete_document_open,
            commands::fail_document_open,
            commands::save_document,
            commands::close_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running akbun-pdf");
}
