mod ai;
mod commands;

// The app carries its own File/Edit/View menus in the window, so the system
// menu bar holds nothing but what macOS insists on: an application menu with
// Quit, and the standard edit items. Those edit items are not decoration —
// WKWebView routes Cmd+C, Cmd+V and Cmd+A through them, and without them
// copy and paste stop working inside the page.
#[cfg(desktop)]
fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, SubmenuBuilder};

    let menu = Menu::new(app.handle())?;
    let app_menu = SubmenuBuilder::new(app, "akbun-makepresentation")
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    menu.append(&app_menu)?;

    // Clipboard only. Undo and Redo are deliberately absent: their predefined
    // items own Cmd+Z, and the webview would take it as text undo, so the
    // deck's own undo would never see the key. The window's Edit menu has it.
    #[cfg(target_os = "macos")]
    {
        let edit = SubmenuBuilder::new(app, "Edit")
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        menu.append(&edit)?;
    }

    app.set_menu(menu)?;
    Ok(())
}

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
            #[cfg(desktop)]
            install_menu(app)?;

            ai::setup(app)?;

            // The window is the whole app, so the webview console is where
            // almost every bug shows up first. Debug builds only.
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
            ai::ai_start_server,
            ai::ai_send_rpc,
            ai::ai_stop_server,
            ai::ai_runtime_directory,
            ai::ai_list_sessions,
            ai::ai_load_session,
            ai::ai_save_session,
            ai::ai_delete_session,
            ai::ai_attach_image,
            ai::ai_save_slide_image,
            ai::ai_copy_image,
            commands::open_deck,
            commands::save_deck,
            commands::export_pdf,
            commands::save_png,
            commands::list_system_fonts,
            commands::load_settings,
            commands::save_settings,
        ])
        .manage(ai::AiRuntime::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
