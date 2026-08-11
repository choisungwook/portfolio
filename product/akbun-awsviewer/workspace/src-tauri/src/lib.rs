mod clilogin;
mod commands;

mod store;

use commands::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        );

    // One window only. The updater restarts the app while the installer may
    // also be starting it, and the second launch lands here instead of
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

            // One line per launch: a log file that starts here but has no
            // page activity after it points at the webview, not the backend.
            log::info!("akbun-awsviewer {} starting", app.package_info().version);

            let handle = app.handle();
            app.manage(AppState {
                settings: Mutex::new(store::load_settings(handle)),
                creds_cache: Mutex::new(HashMap::new()),
                login_url: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::select_profile,
            commands::set_insecure_tls,
            commands::cli_login,
            commands::reopen_login_window,
            commands::cancel_login,
            commands::list_instances,
            commands::instance_detail,
            commands::open_log_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
