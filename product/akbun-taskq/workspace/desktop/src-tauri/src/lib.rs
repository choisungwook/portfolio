//! The window around taskq. It starts the `taskq` binary bundled next to this executable, waits for the address
//! `taskq run` prints, and shows that page. taskq itself is unchanged: the same binary the release ships on its own.

use std::io::{BufRead, BufReader};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
struct Server {
    child: Mutex<Option<Child>>,
    error: Mutex<Option<String>>,
}

/// The start page polls this: null while taskq is starting, its last output once it ended without an address.
#[tauri::command]
fn startup_error(server: State<'_, Server>) -> Option<String> {
    server.error.lock().unwrap().clone()
}

fn spawn(app: &AppHandle) -> Result<ChildStdout, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let taskq = exe.parent().ok_or("the app has no folder")?.join("taskq");
    let shell = std::env::var("SHELL").ok();
    let mut child = Command::new(taskq_launch::login_shell(shell.as_deref()))
        .args(["-ilc", taskq_launch::SCRIPT])
        .arg(&taskq)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("{}: {e}", taskq.display()))?;
    let stdout = child.stdout.take().ok_or("taskq has no output")?;
    *app.state::<Server>().child.lock().unwrap() = Some(child);
    Ok(stdout)
}

/// Reads taskq's output until it ends. The address line moves the window; it is not kept, because it holds the token.
fn follow(app: AppHandle) {
    let stdout = match spawn(&app) {
        Ok(stdout) => stdout,
        Err(error) => return fail(&app, error),
    };
    let mut tail: Vec<String> = Vec::new();
    let mut ready = false;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if !ready {
            if let Some(url) = taskq_launch::ready_url(&line) {
                ready = true;
                if let (Some(window), Ok(url)) = (app.get_webview_window("main"), url.parse()) {
                    let _ = window.navigate(url);
                }
                continue;
            }
        }
        tail.push(line);
        if tail.len() > 20 {
            tail.remove(0);
        }
    }
    // ponytail: a taskq that ends after the window moved leaves a dead page; reopen the app. Watch and reload if it happens.
    if !ready {
        fail(&app, if tail.is_empty() { "taskq ended without output".into() } else { tail.join("\n") });
    }
}

fn fail(app: &AppHandle, error: String) {
    *app.state::<Server>().error.lock().unwrap() = Some(error);
}

/// SIGTERM lets taskq stop its bots and close the database; after 5 seconds it is killed.
fn stop(app: &AppHandle) {
    let Some(mut child) = app.state::<Server>().child.lock().unwrap().take() else { return };
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

/// The window. taskq's page is an ordinary web page, and a webview does nothing with a link that opens a new window
/// or with a download unless the app says what to do: links go to the default browser, downloads to ~/Downloads.
fn open_window(app: &tauri::App) -> tauri::Result<()> {
    let downloads = app.path().download_dir().ok();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("taskq")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // Cmd +/- and Cmd 0 zoom the page, as in a browser; the webview leaves them off unless asked.
        .zoom_hotkeys_enabled(true)
        // The page handles drag and drop itself (board cards, files dropped on a chat). Tauri's own file-drop handler
        // would take those events away from the page.
        .disable_drag_drop_handler()
        .on_new_window(|url, _| {
            if matches!(url.scheme(), "http" | "https") {
                let _ = Command::new("open").arg(url.as_str()).status();
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            if let (DownloadEvent::Requested { destination, .. }, Some(dir)) = (event, &downloads) {
                // ponytail: a file of the same name is overwritten; add a counter if that bites.
                if let Some(name) = destination.file_name() {
                    *destination = dir.join(name);
                }
            }
            true
        })
        .build()?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(Server::default())
        .invoke_handler(tauri::generate_handler![startup_error])
        .setup(|app| {
            open_window(app)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || follow(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building akbun-taskq")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop(app);
            }
        });
}
