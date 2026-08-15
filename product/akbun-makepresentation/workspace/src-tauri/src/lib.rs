mod commands;

#[cfg(desktop)]
const FILE_NEW_ID: &str = "file-new";
#[cfg(desktop)]
const FILE_OPEN_ID: &str = "file-open";
#[cfg(desktop)]
const FILE_SAVE_ID: &str = "file-save";
#[cfg(desktop)]
const FILE_SAVE_AS_ID: &str = "file-save-as";
#[cfg(desktop)]
const FILE_EXPORT_PDF_ID: &str = "file-export-pdf";
#[cfg(desktop)]
const FILE_EXPORT_PNG_ID: &str = "file-export-png";
#[cfg(desktop)]
const FILE_COMMAND_EVENT: &str = "file-command";
#[cfg(desktop)]
const GUIDELINES_MENU_ID: &str = "view-guidelines";
#[cfg(desktop)]
const GUIDELINES_EVENT: &str = "guidelines-changed";

#[cfg(desktop)]
fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{
        CheckMenuItemBuilder, Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem,
        SubmenuBuilder, WINDOW_SUBMENU_ID,
    };
    use tauri::Emitter;

    let menu = Menu::default(app.handle())?;
    let new_item = MenuItemBuilder::with_id(FILE_NEW_ID, "New")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::with_id(FILE_OPEN_ID, "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_item = MenuItemBuilder::with_id(FILE_SAVE_ID, "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::with_id(FILE_SAVE_AS_ID, "PowerPoint (.pptx)…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let export_pdf = MenuItemBuilder::with_id(FILE_EXPORT_PDF_ID, "Export PDF…").build(app)?;
    let export_png = MenuItemBuilder::with_id(FILE_EXPORT_PNG_ID, "Export PNG…").build(app)?;
    let save_as = SubmenuBuilder::new(app, "Save As")
        .item(&save_as_item)
        .separator()
        .item(&export_pdf)
        .item(&export_png)
        .build()?;
    let file_separator = PredefinedMenuItem::separator(app)?;

    let guidelines = CheckMenuItemBuilder::with_id(GUIDELINES_MENU_ID, "Guidelines")
        .checked(false)
        .build(app)?;
    let items = menu.items()?;
    let file = items.iter().find_map(|item| match item {
        MenuItemKind::Submenu(submenu)
            if submenu.text().map(|text| text == "File").unwrap_or(false) =>
        {
            Some(submenu.clone())
        }
        _ => None,
    });
    if let Some(file) = file {
        file.prepend_items(&[&new_item, &open_item, &file_separator, &save_item, &save_as])?;
    } else {
        let file = SubmenuBuilder::new(app, "File")
            .item(&new_item)
            .item(&open_item)
            .separator()
            .item(&save_item)
            .item(&save_as)
            .build()?;
        menu.insert(&file, usize::from(cfg!(target_os = "macos")))?;
    }

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
        let file_command = match event.id().as_ref() {
            FILE_NEW_ID => Some("new"),
            FILE_OPEN_ID => Some("open"),
            FILE_SAVE_ID => Some("save"),
            FILE_SAVE_AS_ID => Some("save-as"),
            FILE_EXPORT_PDF_ID => Some("export-pdf"),
            FILE_EXPORT_PNG_ID => Some("export-png"),
            _ => None,
        };
        if let Some(command) = file_command {
            let _ = app.emit_to("main", FILE_COMMAND_EVENT, command);
        } else if event.id() == GUIDELINES_MENU_ID {
            if let Ok(checked) = guidelines_item.is_checked() {
                let _ = app.emit_to("main", GUIDELINES_EVENT, checked);
            }
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
            commands::list_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
