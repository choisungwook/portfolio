use crate::commands::{find_tool, AppState};
use base64::{engine::general_purpose::STANDARD, Engine};
use makevideo_edit::{AssetKind, Command, DocumentState, Project};
use serde_json::{json, Value};
use std::fs;
use std::process::{Command as Process, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct SamplingRuntime {
    busy: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
}

struct SamplingGuard(Arc<AtomicBool>);
impl Drop for SamplingGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn ai_cancel_sampling(runtime: State<SamplingRuntime>) {
    runtime.cancel.store(true, Ordering::SeqCst);
}

fn fingerprint(asset: &makevideo_edit::Asset) -> Result<String, String> {
    let metadata = fs::metadata(&asset.path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_nanos().to_string())
        .unwrap_or_default();
    Ok(format!("{}:{}:{}", asset.id, metadata.len(), modified))
}

#[tauri::command]
pub fn ai_asset_fingerprints(state: State<AppState>) -> Value {
    let assets = state.document.lock().unwrap().project().assets.clone();
    Value::Object(
        assets
            .iter()
            .filter_map(|asset| {
                fingerprint(asset)
                    .ok()
                    .map(|value| (asset.id.clone(), Value::String(value)))
            })
            .collect(),
    )
}

#[tauri::command]
pub fn ai_preview_plan(
    state: State<AppState>,
    commands: Vec<Command>,
) -> Result<DocumentState, String> {
    let doc = state.document.lock().unwrap();
    makevideo_edit::ai_plan::preview(doc.project(), commands)
}

#[tauri::command]
pub fn ai_apply_plan(
    state: State<AppState>,
    runtime: State<crate::ai_edit::AiEditRuntime>,
    expected: Project,
    revision: u64,
    commands: Vec<Command>,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&runtime)?;
    let mut doc = state.document.lock().unwrap();
    makevideo_edit::ai_plan::apply(&mut doc, &expected, revision, commands)
}

fn library_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("editing-library");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("library.json"))
}

#[tauri::command]
pub fn ai_load_library(app: AppHandle) -> Result<Value, String> {
    let path = library_path(&app)?;
    if !path.exists() {
        return Ok(json!({"templates": [], "analyses": []}));
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_save_library(app: AppHandle, library: Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&library).map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("Editing library is full (4 MiB). Remove unused entries.".into());
    }
    let path = library_path(&app)?;
    let mut temp =
        tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut temp, &bytes).map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ai_sample_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, SamplingRuntime>,
    asset_id: String,
    start_ms: u64,
    end_ms: u64,
) -> Result<Value, String> {
    let asset = state
        .document
        .lock()
        .unwrap()
        .project()
        .assets
        .iter()
        .find(|a| a.id == asset_id)
        .cloned()
        .ok_or("Select an imported asset.")?;
    if !matches!(asset.kind, AssetKind::Video | AssetKind::Image) {
        return Err("Select a video or image.".into());
    }
    if matches!(asset.kind, AssetKind::Video)
        && (start_ms >= end_ms || end_ms > asset.duration_ms || end_ms - start_ms > 60_000)
    {
        return Err("Choose a source interval of up to 60 seconds.".into());
    }
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg =
        find_tool(&app, "ffmpeg", &configured).ok_or("ffmpeg is required to analyze B-roll.")?;
    if runtime.busy.swap(true, Ordering::SeqCst) {
        return Err("Frame sampling is already running.".into());
    }
    let guard = SamplingGuard(runtime.busy.clone());
    runtime.cancel.store(false, Ordering::SeqCst);
    let cancel = runtime.cancel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let source_fingerprint = fingerprint(&asset)?;
        let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
        let count = if matches!(asset.kind, AssetKind::Image) { 1 } else { 8 };
        let mut frames = Vec::new();
        for index in 0..count {
            if cancel.load(Ordering::SeqCst) { return Err("Analysis stopped.".into()); }
            let time = start_ms + (end_ms.saturating_sub(start_ms) * index / count);
            let output = temp.path().join(format!("frame-{index}.jpg"));
            let mut child = Process::new(&ffmpeg).args(["-nostdin", "-v", "error", "-ss", &format!("{:.3}", time as f64 / 1000.0), "-i", &asset.path, "-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease", "-q:v", "4", "-y"]).arg(&output).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
            let started = Instant::now();
            loop {
                if cancel.load(Ordering::SeqCst) {
                    let _ = child.kill(); let _ = child.wait();
                    return Err("Analysis stopped.".into());
                }
                match child.try_wait() {
                    Ok(Some(status)) if status.success() => break,
                    Ok(Some(_)) => return Err("Cannot decode this asset with ffmpeg.".into()),
                    Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error.to_string()); }
                    _ => {}
                }
                if started.elapsed() > Duration::from_secs(10) {
                    let _ = child.kill(); let _ = child.wait();
                    return Err("Frame extraction timed out. Choose a shorter interval.".into());
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            let bytes = fs::read(&output).map_err(|e| e.to_string())?;
            frames.push(json!({"timeMs": time, "url": format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes))}));
        }
        if fingerprint(&asset)? != source_fingerprint { return Err("The source file changed during sampling. Analyze it again.".into()); }
        Ok(json!({"assetId": asset.id, "fingerprint": source_fingerprint, "startMs": start_ms, "endMs": end_ms, "frames": frames}))
    }).await.map_err(|e| e.to_string())?
}
