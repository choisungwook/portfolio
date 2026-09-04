mod commands;

use pdf_core::DocumentState;

#[derive(Default)]
pub struct AppState {
    document: DocumentState,
}

impl AppState {
    fn document(&self) -> DocumentState {
        self.document.clone()
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
        .invoke_handler(tauri::generate_handler![commands::get_document_state])
        .run(tauri::generate_context!())
        .expect("error while running akbun-pdf");
}
