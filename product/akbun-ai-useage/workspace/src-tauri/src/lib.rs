//! Tray-only app. There is no window: the menu bar title carries the summary
//! and the tray menu carries every number as a disabled item. A worker thread
//! collects usage and hands the result to the main thread to redraw the tray.

use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use usage_core::collect::{Collector, Env};
use usage_core::{format, settings, Section};

const TRAY_ID: &str = "usage";

/// Wakes the refresh thread early, for Refresh Now.
struct Refresh(Sender<()>);

/// Resolved once in setup. Without a config dir the app refuses to start
/// rather than read and write settings.json in the working directory.
struct SettingsFile(PathBuf);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn build_menu(
    app: &AppHandle,
    sections: &[Section],
    updated: Option<i64>,
) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    let info = |text: String| MenuItem::new(app, text, false, None::<&str>);
    let now = now_ms();
    for section in sections {
        menu.append(&info(section.name.to_string())?)?;
        for line in format::lines(section, now) {
            menu.append(&info(format!("    {line}"))?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    if updated.is_some() && sections.is_empty() {
        menu.append(&info("No source enabled".into())?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let status = match updated {
        Some(at) => format!("Updated {}", format::clock(at)),
        None => "Loading…".into(),
    };
    menu.append(&info(status)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "refresh",
        "Refresh Now",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Open Settings File…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "update",
        "Check for Updates…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&info(format!("Version {}", app.package_info().version))?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

fn show(app: &AppHandle, sections: &[Section], updated: i64) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let title = format::title(sections);
    // macOS and Linux show the text next to the icon; Windows ignores it and
    // relies on the tooltip.
    let _ = tray.set_title(Some(&title));
    let _ = tray.set_tooltip(Some(format!("akbun-ai-useage\n{title}")));
    if let Ok(menu) = build_menu(app, sections, Some(updated)) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Collects on a worker thread, since log parsing and HTTP block. Settings
/// are reread each round, so an edited file applies on the next refresh.
fn start_refresh_loop(app: AppHandle, settings_file: PathBuf) -> Sender<()> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut collector = Collector::default();
        let env = Env::from_process();
        loop {
            let settings = settings::load(&settings_file);
            let now = now_ms();
            let sections = collector.collect(&settings, &env, now);
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || show(&handle, &sections, now));

            let wait = Duration::from_secs(settings.refresh_minutes.max(1) * 60);
            match receiver.recv_timeout(wait) {
                Ok(()) | Err(RecvTimeoutError::Timeout) => while receiver.try_recv().is_ok() {},
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
    sender
}

fn message(app: &AppHandle, kind: MessageDialogKind, title: &str, text: String) {
    app.dialog()
        .message(text)
        .title(title)
        .kind(kind)
        .show(|_| {});
}

fn check_for_updates(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let checked = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        let update = match checked {
            Ok(Some(update)) => update,
            Ok(None) => {
                let text = format!("Current version {}", app.package_info().version);
                return message(
                    &app,
                    MessageDialogKind::Info,
                    "You are on the latest version",
                    text,
                );
            }
            Err(error) => {
                return message(
                    &app,
                    MessageDialogKind::Error,
                    "Cannot check for updates",
                    error.to_string(),
                );
            }
        };
        let handle = app.clone();
        app.dialog()
            .message(format!(
                "Version {} is available. Current version {}. Update Now installs it and restarts the app.",
                update.version, update.current_version
            ))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancelCustom("Update Now".into(), "Later".into()))
            .show(move |accepted| {
                if !accepted {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => handle.restart(),
                        Err(error) => message(&handle, MessageDialogKind::Error, "Update failed", error.to_string()),
                    }
                });
            });
    });
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "refresh" => {
            let _ = app.state::<Refresh>().0.send(());
        }
        "settings" => {
            let path = app.state::<SettingsFile>().0.clone();
            settings::load(&path);
            if let Err(error) = app.opener().open_path(path.to_string_lossy(), None::<&str>) {
                message(
                    app,
                    MessageDialogKind::Error,
                    "Cannot open settings",
                    error.to_string(),
                );
            }
        }
        "update" => check_for_updates(app.clone()),
        "quit" => app.exit(0),
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        // A second launch, including the one after an update, must not add a
        // second tray icon.
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Menu bar only: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let settings_file = app.path().app_config_dir()?.join("settings.json");
            app.manage(SettingsFile(settings_file.clone()));

            let handle = app.handle().clone();
            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&build_menu(&handle, &[], None)?)
                .title("AI …")
                .tooltip("akbun-ai-useage")
                .on_menu_event(|app, event| on_menu(app, event.id.as_ref()));
            // macOS shows the title alone. Windows and Linux need an icon to
            // show anything at all.
            if !cfg!(target_os = "macos") {
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
            }
            tray.build(app)?;

            app.manage(Refresh(start_refresh_loop(handle, settings_file)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build akbun-ai-useage")
        .run(|_, event| {
            // No window means "all windows closed" is the normal state, so
            // only an explicit Quit may end the process.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
