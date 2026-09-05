use base64::Engine;
use pdf_ai::{AiSettings, AiStore, Conversation, ConversationMessage, ConversationMeta};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct AiRuntime {
    process: Mutex<Option<AppServerProcess>>,
    generation: Arc<AtomicU64>,
}

struct AppServerProcess {
    child: Child,
    stdin: BufWriter<ChildStdin>,
}

impl Drop for AppServerProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerInfo {
    codex_path: String,
    version: String,
    running: bool,
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let store = store(app.handle())?;
    store.ensure()?;
    store.clear_runtime()?;
    Ok(())
}

#[tauri::command]
pub fn ai_start_server(
    app: AppHandle,
    runtime: State<'_, AiRuntime>,
) -> Result<AppServerInfo, String> {
    let mut process = runtime
        .process
        .lock()
        .map_err(|_| "cannot lock Codex App Server state".to_string())?;
    let generation = runtime.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *process = None;

    let codex = find_codex().ok_or_else(|| {
        "codex_cli_not_found: Codex CLI를 설치하고 ChatGPT로 로그인해 주세요.".to_string()
    })?;
    let version = codex_version(&codex)?;
    let store = store(&app)?;
    store.ensure()?;

    let mut child = Command::new(&codex)
        .args(["app-server", "--listen", "stdio://"])
        .current_dir(store.runtime_root())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start Codex App Server: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or("cannot open Codex App Server stdin")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("cannot open Codex App Server stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("cannot open Codex App Server stderr")?;

    let event_app = app.clone();
    let current_generation = Arc::clone(&runtime.generation);
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            let payload = serde_json::from_str::<Value>(&line).unwrap_or_else(
                |_| json!({ "method": "client/protocolError", "params": { "line": line } }),
            );
            let _ = event_app.emit("ai-server-message", payload);
        }
        if current_generation.load(Ordering::SeqCst) == generation {
            let _ = event_app.emit("ai-server-state", json!({ "state": "stopped" }));
        }
    });
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            if line.is_err() {
                break;
            }
        }
    });

    let info = AppServerInfo {
        codex_path: codex.to_string_lossy().to_string(),
        version,
        running: true,
    };
    *process = Some(AppServerProcess {
        child,
        stdin: BufWriter::new(stdin),
    });
    Ok(info)
}

#[tauri::command]
pub fn ai_send_rpc(runtime: State<'_, AiRuntime>, message: Value) -> Result<(), String> {
    let mut process = runtime
        .process
        .lock()
        .map_err(|_| "cannot lock Codex App Server state".to_string())?;
    let server = process
        .as_mut()
        .ok_or("codex_app_server_not_running: Codex 연결을 새로고침해 주세요.")?;
    if server
        .child
        .try_wait()
        .map_err(|error| format!("cannot inspect Codex App Server: {error}"))?
        .is_some()
    {
        *process = None;
        return Err("codex_app_server_stopped: Codex 연결을 새로고침해 주세요.".into());
    }
    serde_json::to_writer(&mut server.stdin, &message)
        .map_err(|error| format!("cannot encode Codex App Server request: {error}"))?;
    server
        .stdin
        .write_all(b"\n")
        .and_then(|_| server.stdin.flush())
        .map_err(|error| format!("cannot send Codex App Server request: {error}"))
}

#[tauri::command]
pub fn ai_stop_server(runtime: State<'_, AiRuntime>) -> Result<(), String> {
    let mut process = runtime
        .process
        .lock()
        .map_err(|_| "cannot lock Codex App Server state".to_string())?;
    runtime.generation.fetch_add(1, Ordering::SeqCst);
    if let Some(mut server) = process.take() {
        let _ = server.child.kill();
        let _ = server.child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn ai_runtime_directory(app: AppHandle) -> Result<String, String> {
    let store = store(&app)?;
    store.ensure()?;
    Ok(store.runtime_root().to_string_lossy().to_string())
}

#[tauri::command]
pub fn ai_load_settings(app: AppHandle) -> Result<AiSettings, String> {
    store(&app)?.load_settings()
}

#[tauri::command]
pub fn ai_save_settings(app: AppHandle, settings: AiSettings) -> Result<AiSettings, String> {
    store(&app)?.save_settings(settings)
}

#[tauri::command]
pub fn ai_list_conversations(app: AppHandle) -> Result<Vec<ConversationMeta>, String> {
    store(&app)?.list_conversations()
}

#[tauri::command]
pub fn ai_create_conversation(
    app: AppHandle,
    id: String,
    title: String,
    created_at: String,
) -> Result<Conversation, String> {
    store(&app)?.create_conversation(id, title, created_at)
}

#[tauri::command]
pub fn ai_load_conversation(app: AppHandle, id: String) -> Result<Conversation, String> {
    store(&app)?.load_conversation(&id)
}

#[tauri::command]
pub fn ai_append_message(
    app: AppHandle,
    conversation_id: String,
    message: ConversationMessage,
) -> Result<ConversationMeta, String> {
    store(&app)?.append_message(&conversation_id, message)
}

#[tauri::command]
pub fn ai_rename_conversation(
    app: AppHandle,
    id: String,
    title: String,
) -> Result<ConversationMeta, String> {
    store(&app)?.rename_conversation(&id, title)
}

#[tauri::command]
pub fn ai_delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    store(&app)?.delete_conversation(&id)
}

#[tauri::command]
pub fn ai_save_page_image(
    app: AppHandle,
    request_id: String,
    page: u32,
    data_url: String,
) -> Result<String, String> {
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("page image is not a PNG data URL")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| format!("bad page image: {error}"))?;
    store(&app)?
        .save_page_image(&request_id, page, &bytes)
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ai_clear_request(app: AppHandle, request_id: String) -> Result<(), String> {
    store(&app)?.clear_request(&request_id)
}

fn store(app: &AppHandle) -> Result<AiStore, String> {
    app.path()
        .app_data_dir()
        .map(AiStore::new)
        .map_err(|error| format!("cannot locate app data directory: {error}"))
}

fn find_codex() -> Option<PathBuf> {
    let executable = if cfg!(windows) { "codex.exe" } else { "codex" };
    let mut candidates = std::env::var_os("PATH")
        .map(|value| {
            std::env::split_paths(&value)
                .map(|directory| directory.join(executable))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if cfg!(target_os = "macos") {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/codex"),
            PathBuf::from("/usr/local/bin/codex"),
        ]);
    }
    candidates.into_iter().find(|path| is_file(path))
}

fn is_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}

fn codex_version(path: &Path) -> Result<String, String> {
    let output = Command::new(path)
        .arg("--version")
        .output()
        .map_err(|error| format!("cannot run Codex CLI: {error}"))?;
    if !output.status.success() {
        return Err("cannot read Codex CLI version".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
