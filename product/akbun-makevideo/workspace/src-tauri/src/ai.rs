use akbun_ai::{AiStore, AppServerInfo, AttachedImage, CodexRuntime, SessionSummary};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

pub type AiRuntime = CodexRuntime;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSession {
    pub session: Value,
    pub image_root: String,
}

fn store(app: &AppHandle) -> Result<AiStore, String> {
    app.path()
        .app_data_dir()
        .map(AiStore::new)
        .map_err(|error| format!("cannot locate app data directory: {error}"))
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let store = store(app.handle())?;
    store.ensure()?;
    app.asset_protocol_scope()
        .allow_directory(store.sessions_root(), true)?;
    Ok(())
}

#[tauri::command]
pub fn ai_start_server(
    app: AppHandle,
    runtime: State<'_, AiRuntime>,
) -> Result<AppServerInfo, String> {
    let store = store(&app)?;
    store.ensure()?;
    let message_app = app.clone();
    let stopped_app = app.clone();
    runtime.start(
        &store.runtime_root(),
        move |payload| {
            let _ = message_app.emit("ai-server-message", payload);
        },
        move || {
            let _ = stopped_app.emit("ai-server-state", json!({ "state": "stopped" }));
        },
    )
}

#[tauri::command]
pub fn ai_send_rpc(runtime: State<'_, AiRuntime>, message: Value) -> Result<(), String> {
    runtime.send_rpc(&message)
}

#[tauri::command]
pub fn ai_stop_server(runtime: State<'_, AiRuntime>) -> Result<(), String> {
    runtime.stop()
}

#[tauri::command]
pub fn ai_runtime_directory(app: AppHandle) -> Result<String, String> {
    let store = store(&app)?;
    store.ensure()?;
    Ok(store.runtime_root().to_string_lossy().to_string())
}

#[tauri::command]
pub fn ai_list_sessions(app: AppHandle) -> Result<Vec<SessionSummary>, String> {
    store(&app)?.list_sessions()
}

#[tauri::command]
pub fn ai_load_session(app: AppHandle, session_id: String) -> Result<LoadedSession, String> {
    let store = store(&app)?;
    let session = store.load_session(&session_id)?;
    let image_root = store
        .session_dir(&session_id)?
        .join("images")
        .to_string_lossy()
        .to_string();
    Ok(LoadedSession {
        session,
        image_root,
    })
}

#[tauri::command]
pub fn ai_save_session(app: AppHandle, session_id: String, session: Value) -> Result<u64, String> {
    store(&app)?.save_session(&session_id, &session)
}

#[tauri::command]
pub fn ai_delete_session(app: AppHandle, session_id: String) -> Result<(), String> {
    store(&app)?.delete_session(&session_id)
}

#[tauri::command]
pub fn ai_attach_image(
    app: AppHandle,
    session_id: String,
    source_path: String,
    image_id: String,
) -> Result<AttachedImage, String> {
    let store = store(&app)?;
    let allowed_sources = [store.runtime_root(), codex_generated_images(&app)?];
    let image = store.attach_image(
        &session_id,
        Path::new(&source_path),
        &image_id,
        &allowed_sources,
    )?;
    app.asset_protocol_scope()
        .allow_file(&image.path)
        .map_err(|error| format!("cannot allow saved AI image: {error}"))?;
    Ok(image)
}

fn codex_generated_images(app: &AppHandle) -> Result<PathBuf, String> {
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(|| {
            app.path()
                .home_dir()
                .map(|home| home.join(".codex"))
                .map_err(|error| format!("cannot locate Codex home directory: {error}"))
        })?;
    Ok(codex_home.join("generated_images"))
}

#[tauri::command]
pub fn ai_copy_image(
    app: AppHandle,
    source_path: String,
    destination_path: String,
) -> Result<(), String> {
    store(&app)?.copy_image(Path::new(&source_path), Path::new(&destination_path))
}
