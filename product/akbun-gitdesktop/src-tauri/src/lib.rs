mod commands;
mod store;

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
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(debug_assertions)]
                window.open_devtools();
                let settings = store::load_settings(app.handle());
                commands::apply_theme(&window, &settings.theme)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_cli_tools,
            commands::get_settings,
            commands::set_theme,
            commands::set_force_remove_worktree,
            commands::list_repos,
            commands::get_repo_sizes,
            commands::import_repo,
            commands::remove_repo,
            commands::get_log,
            commands::get_branches,
            commands::get_worktrees,
            commands::get_default_branch,
            commands::create_branch,
            commands::delete_branches,
            commands::create_worktree,
            commands::remove_worktree,
            commands::get_commit_files,
            commands::get_commit_diff,
            commands::get_range_files,
            commands::get_range_diff,
            commands::get_pull_requests,
            commands::get_pull_request_detail,
            commands::get_issues,
            commands::get_issue_detail,
            commands::get_projects,
            commands::get_project_board,
            commands::open_external,
            commands::list_opener_apps,
            commands::open_in_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
