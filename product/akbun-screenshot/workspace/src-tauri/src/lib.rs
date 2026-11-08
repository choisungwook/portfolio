mod capture;
mod commands;
mod freeze;
mod scrolling;
mod settings;
mod tray;
mod update;
mod windows;

use tauri::{App, Manager, RunEvent, WindowEvent};

/// The macOS menu the windows run under. Undo and Redo are deliberately absent:
/// their predefined items own Cmd+Z, the webview takes it as text undo, and the
/// editor's own undo would never see the key. Close Window keeps Cmd+W working
/// on the preview and the editor.
fn install_menu(app: &App) -> tauri::Result<()> {
    use tauri::menu::{Menu, SubmenuBuilder};

    let app_menu = SubmenuBuilder::new(app, "akbun-screenshot")
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;
    app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &window])?)?;
    Ok(())
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Menu bar only: no dock icon and no main window.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    install_menu(app)?;

    let store = settings::SettingsStore::load(app.handle())?;
    let current = store.get();
    app.manage(store);
    tray::install(app.handle(), &current)?;
    // A shortcut that will not register (taken by another app, say) must not
    // stop the app from starting. The tray menu still captures.
    if let Err(error) = settings::register_shortcuts(app.handle(), &current) {
        eprintln!("{error}");
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(windows::Windows::default())
        .manage(capture::Capturing::default())
        .manage(scrolling::Scrolling::default())
        .setup(setup)
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                window.state::<windows::Windows>().release(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings_get,
            commands::settings_save,
            commands::list_fonts,
            commands::permissions_get,
            commands::open_screen_settings,
            commands::preview_image,
            commands::preview_save,
            commands::preview_copy,
            commands::preview_edit,
            commands::editor_image,
            commands::freeze_image,
            commands::editor_save,
            commands::editor_save_as,
            commands::editor_copy,
            commands::window_close,
            scrolling::scroll_region_select,
            scrolling::scroll_done,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Closing the last window is not quitting for a menu bar app. An
            // explicit exit (the tray's Quit, an update restart) carries a code.
            RunEvent::ExitRequested {
                code: None, api, ..
            } => api.prevent_exit(),
            RunEvent::Exit => app.state::<windows::Windows>().release_all(),
            _ => {}
        });
}
