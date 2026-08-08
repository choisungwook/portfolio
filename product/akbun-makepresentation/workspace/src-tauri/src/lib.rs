mod commands;

#[cfg(desktop)]
const GUIDELINES_MENU_ID: &str = "view-guidelines";
#[cfg(desktop)]
const GUIDELINES_EVENT: &str = "guidelines-changed";

#[cfg(desktop)]
fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{
        CheckMenuItemBuilder, Menu, MenuItemKind, SubmenuBuilder, WINDOW_SUBMENU_ID,
    };
    use tauri::Emitter;

    let menu = Menu::default(app.handle())?;
    let guidelines = CheckMenuItemBuilder::with_id(GUIDELINES_MENU_ID, "Guidelines")
        .checked(false)
        .build(app)?;
    let items = menu.items()?;
    let view = items.iter().find_map(|item| match item {
        MenuItemKind::Submenu(submenu)
            if submenu.text().map(|text| text == "View").unwrap_or(false) =>
        {
            Some(submenu.clone())
        }
        _ => None,
    });

    if let Some(view) = view {
        view.append(&guidelines)?;
    } else {
        let view = SubmenuBuilder::new(app, "View").item(&guidelines).build()?;
        let position = items
            .iter()
            .position(|item| item.id() == WINDOW_SUBMENU_ID)
            .unwrap_or(items.len());
        menu.insert(&view, position)?;
    }
    app.set_menu(menu)?;

    let guidelines_item = guidelines.clone();
    app.on_menu_event(move |app, event| {
        if event.id() != GUIDELINES_MENU_ID {
            return;
        }
        if let Ok(checked) = guidelines_item.is_checked() {
            let _ = app.emit_to("main", GUIDELINES_EVENT, checked);
        }
    });
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
            commands::open_deck,
            commands::save_deck,
            commands::export_pdf,
            commands::save_png,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
