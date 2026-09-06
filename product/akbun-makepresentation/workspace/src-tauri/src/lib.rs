mod ai;
mod clipboard;
mod commands;
mod documents;

// WKWebView routes clipboard shortcuts through the standard edit items.
#[cfg(desktop)]
fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, SubmenuBuilder};

    let menu = Menu::new(app.handle())?;
    let app_menu = SubmenuBuilder::new(app, "akbun-makepresentation")
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    menu.append(&app_menu)?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&MenuItem::with_id(
            app,
            "zoom-in",
            "Zoom In",
            true,
            Some("CmdOrCtrl+="),
        )?)
        .item(&MenuItem::with_id(
            app,
            "zoom-out",
            "Zoom Out",
            true,
            Some("CmdOrCtrl+-"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "zoom-fit",
            "Fit to Window",
            true,
            Some("CmdOrCtrl+0"),
        )?)
        .build()?;
    menu.append(&view)?;

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

            documents::setup(app)?;
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
            documents::initial_document,
            documents::launch_document,
            clipboard::write_shape_clipboard,
            clipboard::read_shape_clipboard,
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
        .on_menu_event(|app, event| {
            use tauri::{Emitter, Manager};
            if matches!(event.id().as_ref(), "zoom-in" | "zoom-out" | "zoom-fit") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("file-command", event.id().as_ref());
                }
            }
        })
        .manage(ai::AiRuntime::default())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Err(error) =
                            documents::launch_document(Some(path.to_string_lossy().into()))
                        {
                            use tauri::Emitter;
                            let _ = _app.emit("document-open-error", error);
                        }
                    }
                }
            }
        });
}
