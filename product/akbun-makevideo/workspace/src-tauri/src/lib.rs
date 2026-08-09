mod commands;
mod playback;
mod store;
mod viewport;

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
                playback: Mutex::new(None),
                proxies: Arc::new(Mutex::new(commands::ProxyState::default())),
                proxy_workers: Mutex::new(Vec::new()),
                waveforms: Arc::new(Mutex::new(commands::WaveformState::default())),
                waveform_workers: Mutex::new(Vec::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::font_available,
            commands::validate_lut,
            commands::save_settings,
            commands::report_error,
            commands::list_projects,
            commands::create_project,
            commands::delete_project,
            commands::import_assets,
            commands::proxy_status,
            commands::start_proxies,
            commands::waveform_status,
            commands::start_waveforms,
            commands::edit_state,
            commands::edit_apply,
            commands::edit_undo,
            commands::edit_redo,
            commands::describe_asset,
            commands::import_srt,
            commands::export_srt,
            commands::new_document,
            commands::open_project,
            commands::save_project,
            commands::start_render,
            commands::cancel_render,
            commands::preview_frame,
            commands::playback_attach,
            commands::playback_release,
            commands::playback_play,
            commands::playback_pause,
            commands::playback_seek,
            commands::playback_redraw,
            commands::playback_place,
            commands::playback_visible,
            commands::playback_status,
            commands::process_memory_bytes,
            commands::process_metrics,
            commands::read_error_log,
            commands::save_quality_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
