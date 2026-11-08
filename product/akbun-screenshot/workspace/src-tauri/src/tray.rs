//! The menu bar icon and its menu. The app has no dock icon and no main window,
//! so this is the whole entry point.

use crate::{capture, update, windows};
use screenshot_core::capture::CaptureMode;
use screenshot_core::settings::Settings;
use tauri::menu::{Menu, MenuBuilder, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

const TRAY_ID: &str = "main";

pub fn install(app: &AppHandle, settings: &Settings) -> tauri::Result<()> {
    // An emoji title instead of an image asset. Swap for a 16pt template png if
    // it ever renders poorly.
    TrayIconBuilder::with_id(TRAY_ID)
        .title("📷")
        .tooltip("akbun-screenshot")
        .menu(&build_menu(app, settings)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(mode) = CaptureMode::from_id(id) {
                return capture::start(app, mode);
            }
            match id {
                "settings" => windows::open_settings(app),
                "update" => update::check(app),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the menu so the capture items show the new shortcuts.
pub fn refresh(app: &AppHandle, settings: &Settings) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, settings)) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// One item per capture mode, carrying its shortcut when one is assigned.
fn capture_item(
    app: &AppHandle,
    mode: CaptureMode,
    shortcut: &str,
) -> tauri::Result<MenuItem<Wry>> {
    let accelerator = Some(shortcut).filter(|s| !s.is_empty());
    // The menu parser and the shortcut parser accept slightly different
    // strings, so a shortcut that registered may still not display.
    MenuItem::with_id(app, mode.id(), mode.label(), true, accelerator)
        .or_else(|_| MenuItem::with_id(app, mode.id(), mode.label(), true, None::<&str>))
}

fn build_menu(app: &AppHandle, settings: &Settings) -> tauri::Result<Menu<Wry>> {
    let mut menu = MenuBuilder::new(app);
    for mode in CaptureMode::ALL {
        menu = menu.item(&capture_item(app, mode, settings.shortcut_for(mode))?);
    }
    let version = format!("Version {}", app.package_info().version);
    menu.separator()
        .text("settings", "Settings…")
        .text("update", "Check for Updates…")
        .separator()
        .item(&MenuItem::with_id(
            app,
            "version",
            version,
            false,
            None::<&str>,
        )?)
        .text("quit", "Quit")
        .build()
}
