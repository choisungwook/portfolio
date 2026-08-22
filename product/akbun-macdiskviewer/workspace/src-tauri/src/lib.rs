mod catalog;
mod scanner;
mod terminals;
mod worktrees;

use catalog::{CatalogQuery, CatalogResult, ScanIssue};
use scanner::{Backend, ScanState};
use serde::Serialize;
use serde_json::Value;
use std::ffi::CString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager, State, WindowEvent};
use terminals::Terminal;
use worktrees::WorktreeCatalog;

#[derive(Serialize)]
struct DiskUsage {
    total: u64,
    free: u64,
    used: u64,
}

#[derive(Serialize)]
struct ApplicationState {
    disk: DiskUsage,
    scan: ScanState,
    catalog: Option<Value>,
}

#[tauri::command]
async fn app_state(state: State<'_, Backend>) -> Result<ApplicationState, String> {
    let paths = state.paths();
    Ok(ApplicationState {
        disk: disk_usage()?,
        scan: state.scan_state(),
        catalog: catalog::metadata(&paths.current)?,
    })
}

#[tauri::command]
async fn catalog_query(
    state: State<'_, Backend>,
    query: CatalogQuery,
) -> Result<CatalogResult, String> {
    catalog::query(&state.paths().current, query)
}

#[tauri::command]
async fn catalog_issues(state: State<'_, Backend>) -> Result<Vec<ScanIssue>, String> {
    catalog::issues(&state.paths().current, 100)
}

#[tauri::command]
async fn worktree_catalog(state: State<'_, Backend>) -> Result<WorktreeCatalog, String> {
    worktrees::discover(&state.paths().current)
}

#[tauri::command]
fn scan_start(app: AppHandle, state: State<'_, Backend>) -> Result<bool, String> {
    scanner::start(app, state.inner().clone())
}

#[tauri::command]
fn scan_pause(app: AppHandle, state: State<'_, Backend>) -> bool {
    if !state.send("pause") {
        return false;
    }
    state.update_status("paused");
    let _ = tauri::Emitter::emit(&app, "scan-state", state.scan_state());
    true
}

#[tauri::command]
fn scan_resume(app: AppHandle, state: State<'_, Backend>) -> bool {
    if !state.send("resume") {
        return false;
    }
    state.update_status("running");
    let _ = tauri::Emitter::emit(&app, "scan-state", state.scan_state());
    true
}

#[tauri::command]
fn scan_cancel(state: State<'_, Backend>) -> bool {
    state.send("cancel")
}

#[tauri::command]
async fn terminals() -> Vec<Terminal> {
    terminals::detect()
}

#[tauri::command]
async fn show_in_finder(target_path: String) -> Result<(), String> {
    let target = validated_path(&target_path)?;
    Command::new("/usr/bin/open")
        .arg("-R")
        .arg(target)
        .spawn()
        .map_err(error_text)?;
    Ok(())
}

#[tauri::command]
async fn open_in_terminal(
    app_path: String,
    target_path: String,
    kind: String,
) -> Result<(), String> {
    let target = validated_path(&target_path)?;
    let directory = if kind == "directory" {
        target
    } else {
        target.parent().unwrap_or(Path::new("/")).to_path_buf()
    };
    terminals::open_terminal(&app_path, &directory)
}

#[tauri::command]
async fn open_full_disk_access() -> Result<(), String> {
    Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .map_err(error_text)?;
    Ok(())
}

fn validated_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("path must be absolute".into());
    }
    Ok(path)
}

fn disk_usage() -> Result<DiskUsage, String> {
    let path = CString::new("/").unwrap();
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    let result = unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) };
    if result != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let stats = unsafe { stats.assume_init() };
    let total = u64::from(stats.f_blocks).saturating_mul(stats.f_frsize);
    let free = u64::from(stats.f_bavail).saturating_mul(stats.f_frsize);
    Ok(DiskUsage {
        total,
        free,
        used: total.saturating_sub(free),
    })
}

fn error_text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Backend::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let backend = app.state::<Backend>();
            backend.configure(data_dir);
            scanner::recover_database(&backend.paths()).map_err(std::io::Error::other)?;
            if !backend.paths().current.exists() {
                scanner::start(app.handle().clone(), backend.inner().clone())
                    .map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.state::<Backend>().stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_state,
            catalog_query,
            catalog_issues,
            worktree_catalog,
            scan_start,
            scan_pause,
            scan_resume,
            scan_cancel,
            terminals,
            show_in_finder,
            open_in_terminal,
            open_full_disk_access,
        ])
        .run(tauri::generate_context!())
        .expect("error while running akbun-macdiskviewer");
}
