mod commands;

mod store;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    let mut builder = tauri::Builder::default();

    // One window only. The updater restarts the app while the installer may
    // also be starting it, and Windows sends the second launch here instead of
    // opening a duplicate window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init());

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

            // The asset protocol grant is in-memory, so last run's folders have
            // to be granted again or every thumbnail is a broken image.
            let library = store::load_library(handle);
            for root in &library.roots {
                commands::allow_asset_dir(handle, &root.path);
            }
            // Files added one at a time sit under no root and need their own
            // grant. Granting the file rather than its folder keeps the reach
            // to what the user actually picked.
            for entry in &library.entries {
                commands::allow_asset_file(handle, &entry.path);
            }
            // The grid reads cached thumbnails instead of the originals, so
            // this local folder is the only thing a normal start touches.
            if let Ok(thumbs) = store::thumbs_dir(handle) {
                commands::allow_asset_dir(handle, &thumbs.to_string_lossy());
            }

            app.manage(AppState {
                library: Mutex::new(library),
                settings: Mutex::new(settings),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library,
            commands::add_folder,
            commands::add_files,
            commands::rescan,
            commands::remove_root,
            commands::update_entry,
            commands::rename_entry,
            commands::delete_entry,
            commands::open_entry,
            commands::reveal_entry,
            commands::copy_path,
            commands::open_data_dir,
            commands::save_settings,
            commands::save_thumb,
            commands::clear_thumbs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
