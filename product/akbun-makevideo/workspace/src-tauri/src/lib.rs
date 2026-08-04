mod commands;
mod store;

use commands::AppState;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            // The window is the whole app, so the webview console is where
            // almost every bug shows up first. Debug builds only.
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            let handle = app.handle();
            let settings = store::load_settings(handle);
            commands::apply_theme(handle, &settings.theme);

            // The app opens on an empty project of whatever shape new projects
            // are set to, so there is an edit to send commands to before the
            // page has finished loading.
            let document = makevideo_edit::Document::new(makevideo_edit::ProjectSettings {
                width: settings.default_width,
                height: settings.default_height,
                rate: settings.default_rate,
            });

            app.manage(AppState {
                document: Arc::new(Mutex::new(document)),
                settings: Mutex::new(settings),
                render: Arc::new(Mutex::new(None)),
                cancelled: Arc::new(AtomicBool::new(false)),
                accel: Mutex::new(None),
                compositor: Mutex::new(Vec::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_settings,
            commands::report_error,
            commands::list_projects,
            commands::create_project,
            commands::import_assets,
            commands::edit_state,
            commands::edit_apply,
            commands::edit_undo,
            commands::edit_redo,
            commands::describe_asset,
            commands::new_document,
            commands::open_project,
            commands::save_project,
            commands::start_render,
            commands::cancel_render,
            commands::preview_frame,
            commands::process_memory_bytes,
            commands::save_quality_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
