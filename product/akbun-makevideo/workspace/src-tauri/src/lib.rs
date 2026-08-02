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

            app.manage(AppState {
                settings: Mutex::new(settings),
                render: Arc::new(Mutex::new(None)),
                cancelled: Arc::new(AtomicBool::new(false)),
                accel: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_settings,
            commands::list_projects,
            commands::create_project,
            commands::import_assets,
            commands::open_project,
            commands::save_project,
            commands::start_render,
            commands::cancel_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
