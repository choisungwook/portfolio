//! The menu bar icon and its menu. The app has no dock icon and no main window,
//! so this is the whole entry point.

use crate::{update, windows};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

const TRAY_ID: &str = "main";

pub fn install(app: &AppHandle, shortcut: &str) -> tauri::Result<()> {
    // An emoji title instead of an image asset. Swap for a 16pt template png if
    // it ever renders poorly.
    TrayIconBuilder::with_id(TRAY_ID)
        .title("📷")
        .tooltip("akbun-screenshot")
        .menu(&build_menu(app, shortcut)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture" => windows::capture_area(app),
            "settings" => windows::open_settings(app),
            "update" => update::check(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the menu so the Capture Area item shows the new shortcut.
pub fn refresh(app: &AppHandle, shortcut: &str) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, shortcut)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(app: &AppHandle, shortcut: &str) -> tauri::Result<Menu<Wry>> {
    // The menu parser and the shortcut parser accept slightly different
    // strings, so a shortcut that registered may still not display.
    let capture = MenuItem::with_id(app, "capture", "Capture Area", true, Some(shortcut))
        .or_else(|_| MenuItem::with_id(app, "capture", "Capture Area", true, None::<&str>))?;
    let version = format!("Version {}", app.package_info().version);
    Menu::with_items(
        app,
        &[
            &capture,
            &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
            &MenuItem::with_id(app, "update", "Check for Updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "version", version, false, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )
}
