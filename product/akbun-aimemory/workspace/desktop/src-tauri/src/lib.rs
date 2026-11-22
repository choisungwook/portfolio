//! The desktop window around `aimem serve`. It starts the `aimem` binary bundled next to this executable, waits for
//! the loopback URL `aimem serve --port 0` prints, and navigates the window there. Self-updates use the official
//! Tauri updater plugin reachable from the app menu ("Check for Updates…").

use std::io::{BufRead, BufReader};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const MENU_CHECK_UPDATES: &str = "check-for-updates";
static UPDATING: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct Server {
    child: Mutex<Option<Child>>,
    error: Mutex<Option<String>>,
}

/// Polled by the bundled start page: null while starting, or the last lines printed by `aimem` if startup failed.
#[tauri::command]
fn startup_error(server: State<'_, Server>) -> Option<String> {
    server.error.lock().unwrap().clone()
}

fn spawn(app: &AppHandle) -> Result<ChildStdout, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let aimem = exe.parent().ok_or("the app has no folder")?.join("aimem");
    let shell = std::env::var("SHELL").ok();
    let mut child = Command::new(aimemory_launch::login_shell(shell.as_deref()))
        .args(["-ilc", aimemory_launch::SCRIPT])
        .arg(&aimem)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("{}: {e}", aimem.display()))?;
    let stdout = child.stdout.take().ok_or("aimem has no output")?;
    *app.state::<Server>().child.lock().unwrap() = Some(child);
    Ok(stdout)
}

fn follow(app: AppHandle) {
    let stdout = match spawn(&app) {
        Ok(stdout) => stdout,
        Err(error) => return fail(&app, error),
    };
    let mut tail: Vec<String> = Vec::new();
    let mut ready = false;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if !ready {
            if let Some(url) = aimemory_launch::ready_url(&line) {
                if let (Some(window), Ok(parsed)) = (app.get_webview_window("main"), url.parse()) {
                    ready = true;
                    let _ = window.navigate(parsed);
                    continue;
                }
            }
        }
        tail.push(line);
        if tail.len() > 200 {
            tail.remove(0);
        }
    }
    if !ready {
        fail(
            &app,
            if tail.is_empty() {
                "aimem ended without output".into()
            } else {
                tail.join("\n")
            },
        );
    }
}

fn fail(app: &AppHandle, error: String) {
    *app.state::<Server>().error.lock().unwrap() = Some(error);
}

fn stop(app: &AppHandle) {
    let Some(mut child) = app.state::<Server>().child.lock().unwrap().take() else {
        return;
    };
    let _ = Command::new("kill").arg(child.id().to_string()).status();
    let until = Instant::now() + Duration::from_secs(5);
    while Instant::now() < until {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn message(app: &AppHandle, kind: MessageDialogKind, title: &str, text: String) {
    app.dialog().message(text).title(title).kind(kind).show(|_| {});
}

fn check_for_updates(app: AppHandle) {
    if UPDATING.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let checked = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        let update = match checked {
            Ok(Some(update)) => update,
            Ok(None) => {
                UPDATING.store(false, Ordering::SeqCst);
                let text = format!("Current version {}", app.package_info().version);
                return message(&app, MessageDialogKind::Info, "You are on the latest version", text);
            }
            Err(error) => {
                UPDATING.store(false, Ordering::SeqCst);
                return message(&app, MessageDialogKind::Error, "Cannot check for updates", error.to_string());
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
                    UPDATING.store(false, Ordering::SeqCst);
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => handle.restart(),
                        Err(error) => {
                            UPDATING.store(false, Ordering::SeqCst);
                            message(&handle, MessageDialogKind::Error, "Update failed", error.to_string());
                        }
                    }
                });
            });
    });
}

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let check_updates = MenuItem::with_id(app, MENU_CHECK_UPDATES, "Check for Updates…", true, None::<&str>)?;
    let app_submenu = Submenu::with_items(
        app,
        "akbun-aimemory",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &check_updates,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])
}

fn open_window(app: &tauri::App) -> tauri::Result<()> {
    let downloads = app.path().download_dir().ok();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("akbun-aimemory")
        .inner_size(1200.0, 820.0)
        .min_inner_size(800.0, 540.0)
        .zoom_hotkeys_enabled(true)
        .disable_drag_drop_handler()
        .on_new_window(|url, _| {
            if matches!(url.scheme(), "http" | "https") {
                let _ = Command::new("open").arg(url.as_str()).status();
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            if let (DownloadEvent::Requested { destination, .. }, Some(dir)) = (event, &downloads) {
                if let Some(name) = destination.file_name() {
                    *destination = dir.join(name);
                }
            }
            true
        })
        .build()?;
    #[cfg(debug_assertions)]
    window.open_devtools();
    let _ = window;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Server::default())
        .invoke_handler(tauri::generate_handler![startup_error])
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            open_window(app)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || follow(handle));
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == MENU_CHECK_UPDATES {
                check_for_updates(app.clone());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building akbun-aimemory")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop(app);
            }
        });
}
