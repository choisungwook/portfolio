//! Check for Updates… through the official updater plugin. The manifest sits on
//! a fixed per-product tag, because this repository releases several products
//! and GitHub's releases/latest points at whichever shipped last.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// A second click while a check or download runs must not start another one.
static BUSY: AtomicBool = AtomicBool::new(false);

pub fn check(app: &AppHandle) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run(&app).await {
            notify(&app, MessageDialogKind::Error, "Update failed", &error);
        }
        BUSY.store(false, Ordering::SeqCst);
    });
}

async fn run(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Cannot check for updates: {e}"))?;
    let Some(update) = update else {
        let current = app.package_info().version.to_string();
        let text = format!("Current version {current}");
        notify(
            app,
            MessageDialogKind::Info,
            "You are on the latest version",
            &text,
        );
        return Ok(());
    };

    let title = format!("Version {} is available", update.version);
    // A development build runs from target/, not from an .app bundle, so there
    // is nothing for the installer to replace.
    if cfg!(debug_assertions) {
        let text = "Development builds do not install updates.";
        notify(app, MessageDialogKind::Info, &title, text);
        return Ok(());
    }

    let dialog = app
        .dialog()
        .message(format!(
            "Current version {}. Update Now downloads the new version, replaces the app and relaunches it.",
            update.current_version
        ))
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom("Update Now".into(), "Later".into()));
    // Off the main thread, so blocking here does not freeze the app.
    let accepted = tauri::async_runtime::spawn_blocking(move || dialog.blocking_show())
        .await
        .unwrap_or(false);
    if !accepted {
        return Ok(());
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

pub fn notify(app: &AppHandle, kind: MessageDialogKind, title: &str, text: &str) {
    app.dialog()
        .message(text)
        .title(title)
        .kind(kind)
        .show(|_| {});
}
