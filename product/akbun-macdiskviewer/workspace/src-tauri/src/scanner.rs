use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub entries: u64,
    pub files: u64,
    pub directories: u64,
    pub issues: u64,
    pub bytes: u64,
    pub current_path: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanState {
    pub status: String,
    pub progress: Option<ScanProgress>,
    pub error: Option<String>,
}

impl Default for ScanState {
    fn default() -> Self {
        Self {
            status: "idle".into(),
            progress: None,
            error: None,
        }
    }
}

struct ScannerControl {
    stdin: ChildStdin,
    pid: u32,
}

#[derive(Default)]
struct BackendInner {
    data_dir: PathBuf,
    scan: ScanState,
    control: Option<ScannerControl>,
}

#[derive(Clone, Default)]
pub struct Backend {
    inner: Arc<Mutex<BackendInner>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ScannerMessage {
    Progress { progress: ScanProgress },
    Complete { result: ScanProgress },
    Cancelled,
    Error { error: String },
}

pub struct DatabasePaths {
    pub current: PathBuf,
    pub next: PathBuf,
    pub backup: PathBuf,
}

impl Backend {
    pub fn configure(&self, data_dir: PathBuf) {
        self.inner.lock().unwrap().data_dir = data_dir;
    }

    pub fn scan_state(&self) -> ScanState {
        self.inner.lock().unwrap().scan.clone()
    }

    pub fn paths(&self) -> DatabasePaths {
        let data_dir = self.inner.lock().unwrap().data_dir.clone();
        DatabasePaths {
            current: data_dir.join("disk-index.sqlite"),
            next: data_dir.join("disk-index.next.sqlite"),
            backup: data_dir.join("disk-index.backup.sqlite"),
        }
    }

    pub fn send(&self, message_type: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let Some(control) = inner.control.as_mut() else {
            return false;
        };
        writeln!(control.stdin, "{{\"type\":\"{message_type}\"}}").is_ok()
    }

    pub fn update_status(&self, status: &str) {
        self.inner.lock().unwrap().scan.status = status.into();
    }

    pub fn stop(&self) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(control) = inner.control.as_mut() {
            let _ = writeln!(control.stdin, "{{\"type\":\"cancel\"}}");
            unsafe {
                libc::kill(control.pid as i32, libc::SIGTERM);
            }
        }
    }
}

pub fn recover_database(paths: &DatabasePaths) -> Result<(), String> {
    if !paths.current.exists() && paths.backup.exists() {
        fs::rename(&paths.backup, &paths.current).map_err(error_text)?;
    }
    if paths.next.exists() {
        fs::remove_file(&paths.next).map_err(error_text)?;
    }
    Ok(())
}

pub fn start(app: AppHandle, backend: Backend) -> Result<bool, String> {
    {
        let inner = backend.inner.lock().unwrap();
        if inner.control.is_some() {
            return Ok(false);
        }
    }
    let paths = backend.paths();
    if paths.next.exists() {
        fs::remove_file(&paths.next).map_err(error_text)?;
    }
    let executable = scanner_executable(&app)?;
    let mut child = Command::new("/usr/bin/nice")
        .args(["-n", "10"])
        .arg(executable)
        .args(["--root", "/", "--database"])
        .arg(&paths.next)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(error_text)?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "scanner stdin unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "scanner stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "scanner stderr unavailable".to_string())?;
    {
        let mut inner = backend.inner.lock().unwrap();
        inner.scan = ScanState {
            status: "running".into(),
            progress: None,
            error: None,
        };
        inner.control = Some(ScannerControl { stdin, pid });
    }
    emit_state(&app, &backend);

    let diagnostics = Arc::new(Mutex::new(String::new()));
    let reader_app = app.clone();
    let reader_backend = backend.clone();
    let reader_paths = backend.paths();
    let reader_diagnostics = diagnostics.clone();
    let stdout_thread = thread::spawn(move || {
        let mut outcome = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            match serde_json::from_str::<ScannerMessage>(&line) {
                Ok(message) => {
                    outcome |= matches!(
                        message,
                        ScannerMessage::Complete { .. }
                            | ScannerMessage::Cancelled
                            | ScannerMessage::Error { .. }
                    );
                    handle_message(&reader_app, &reader_backend, &reader_paths, message);
                }
                Err(_) => {
                    let mut diagnostics = reader_diagnostics.lock().unwrap();
                    diagnostics.push_str("Invalid scanner output: ");
                    diagnostics.push_str(&line);
                    diagnostics.push('\n');
                }
            }
        }
        outcome
    });
    let error_diagnostics = diagnostics.clone();
    let stderr_thread = thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let mut diagnostics = error_diagnostics.lock().unwrap();
            diagnostics.push_str(&line);
            diagnostics.push('\n');
        }
    });
    thread::spawn(move || {
        let status = child.wait();
        let outcome = stdout_thread.join().unwrap_or(false);
        let _ = stderr_thread.join();
        {
            let mut inner = backend.inner.lock().unwrap();
            if inner
                .control
                .as_ref()
                .is_some_and(|control| control.pid == pid)
            {
                inner.control = None;
            }
            if !outcome {
                let detail = diagnostics.lock().unwrap().trim().to_string();
                inner.scan = ScanState {
                    status: "error".into(),
                    progress: None,
                    error: Some(if detail.is_empty() {
                        format!("scanner exited with {status:?}")
                    } else {
                        detail
                    }),
                };
            }
        }
        if !outcome {
            emit_state(&app, &backend);
        }
    });
    Ok(true)
}

fn handle_message(
    app: &AppHandle,
    backend: &Backend,
    paths: &DatabasePaths,
    message: ScannerMessage,
) {
    match message {
        ScannerMessage::Progress { progress } => {
            backend.inner.lock().unwrap().scan.progress = Some(progress);
        }
        ScannerMessage::Complete { result } => {
            let scan = match install_completed_scan(paths) {
                Ok(()) => ScanState {
                    status: "complete".into(),
                    progress: Some(result),
                    error: None,
                },
                Err(error) => ScanState {
                    status: "error".into(),
                    progress: None,
                    error: Some(error),
                },
            };
            backend.inner.lock().unwrap().scan = scan;
        }
        ScannerMessage::Cancelled => {
            let _ = fs::remove_file(&paths.next);
            backend.inner.lock().unwrap().scan = ScanState {
                status: "cancelled".into(),
                progress: None,
                error: None,
            };
        }
        ScannerMessage::Error { error } => {
            let _ = fs::remove_file(&paths.next);
            backend.inner.lock().unwrap().scan = ScanState {
                status: "error".into(),
                progress: None,
                error: Some(error),
            };
        }
    }
    emit_state(app, backend);
}

fn install_completed_scan(paths: &DatabasePaths) -> Result<(), String> {
    let _ = fs::remove_file(&paths.backup);
    if paths.current.exists() {
        fs::rename(&paths.current, &paths.backup).map_err(error_text)?;
    }
    if let Err(error) = fs::rename(&paths.next, &paths.current) {
        if paths.backup.exists() {
            let _ = fs::rename(&paths.backup, &paths.current);
        }
        return Err(error_text(error));
    }
    let _ = fs::remove_file(&paths.backup);
    Ok(())
}

fn scanner_executable(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../scanner/target/release/akbun-macdiskviewer-scanner"));
    }
    app.path()
        .resource_dir()
        .map(|path| path.join("bin/akbun-macdiskviewer-scanner"))
        .map_err(error_text)
}

fn emit_state(app: &AppHandle, backend: &Backend) {
    let _ = app.emit("scan-state", backend.scan_state());
}

fn error_text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn recovers_backup_and_removes_incomplete_scan() {
        let directory = tempdir().unwrap();
        let paths = DatabasePaths {
            current: directory.path().join("current.sqlite"),
            next: directory.path().join("next.sqlite"),
            backup: directory.path().join("backup.sqlite"),
        };
        fs::write(&paths.backup, b"complete").unwrap();
        fs::write(&paths.next, b"partial").unwrap();
        recover_database(&paths).unwrap();
        assert_eq!(fs::read(&paths.current).unwrap(), b"complete");
        assert!(!paths.backup.exists());
        assert!(!paths.next.exists());
    }

    #[test]
    fn installs_completed_scan_and_removes_backup() {
        let directory = tempdir().unwrap();
        let paths = DatabasePaths {
            current: directory.path().join("current.sqlite"),
            next: directory.path().join("next.sqlite"),
            backup: directory.path().join("backup.sqlite"),
        };
        fs::write(&paths.current, b"old").unwrap();
        fs::write(&paths.next, b"new").unwrap();
        install_completed_scan(&paths).unwrap();
        assert_eq!(fs::read(&paths.current).unwrap(), b"new");
        assert!(!paths.next.exists());
        assert!(!paths.backup.exists());
    }
}
