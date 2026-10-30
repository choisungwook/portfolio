mod commands;

use commands::AppState;
use makephoto_core::catalog::{self, Store};
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
            // The same path the CLI uses, so both see one catalog.
            let store = Store::new(catalog::default_path());
            let settings_path = commands::settings_file(&store);
            let thumbs = commands::thumbs_dir();
            std::fs::create_dir_all(&thumbs)?;
            // Only the thumbnail cache is served to <img>. Originals reach the
            // page as rendered JPEG bytes, so no photo folder needs a grant.
            app.asset_protocol_scope().allow_directory(&thumbs, false)?;

            let state = AppState::new(store, thumbs, settings_path);
            let theme = state.settings.lock().unwrap().theme.clone();
            app.manage(state);
            commands::apply_theme(app.handle(), &theme);

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::catalog_state,
            commands::catalog_revision,
            commands::import_paths,
            commands::remove_photos,
            commands::tag_photos,
            commands::rename_tag,
            commands::rate_photos,
            commands::relink_folder,
            commands::save_edit,
            commands::render_preview,
            commands::auto_adjust,
            commands::thumbnails,
            commands::export_photos,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running akbun-makephoto");
}
