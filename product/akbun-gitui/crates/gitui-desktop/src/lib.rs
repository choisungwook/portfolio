mod commands;

use std::sync::Mutex;

pub struct AppState {
    pub repo: Mutex<Option<git2::Repository>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            repo: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_repository,
            commands::get_status,
            commands::get_log,
            commands::get_branches,
            commands::get_workdir_diff,
            commands::get_staged_diff,
            commands::get_commit_diff,
            commands::stage_files,
            commands::unstage_files,
            commands::create_commit,
            commands::checkout_branch,
            commands::create_branch,
            commands::delete_branch,
            commands::merge_branch,
            commands::get_credentials,
            commands::get_ssh_keys,
            commands::set_active_credential,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
