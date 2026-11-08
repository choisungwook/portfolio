//! The whole IPC surface.
//!
//! The page picks paths with native dialogs and hands them over; everything
//! that touches the file system or spawns a process happens here. That keeps
//! capabilities/default.json short, because the webview never needs a file
//! system scope of its own.
//!
//! The edit itself lives here too, in the [`Document`] held by [`AppState`].
//! The page sends a command and redraws from the state that comes back; the
//! preview and the render read the same document rather than being handed a
//! copy of the timeline along with the request.

use crate::playback::{
    Config as PlaybackConfig, Session, Status as PlaybackStatus, EXPLICIT_RECONFIGURE_PENDING,
};
use crate::viewport::MonitorPlace;
use makevideo_compositor::{Backend, Compositor};
// Aliased because this file also spawns processes, and two things called
// Command in one file is one too many.
use makevideo_edit::{
    Command as Edit, Document, DocumentState, ProjectSettings, TextStyle, TrackKind, VisualContent,
    VisualTransform,
};
use makevideo_present::fallback::{choose, Choice};
use makevideo_present::surface::Guides;
use makevideo_render::accel::{self, Acceleration};
use makevideo_render::{ffmpeg, probe, tools, workspace, Asset, AssetKind, Project, Rate};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    /// The edit. One copy, and this is it: the page draws what this says and
    /// the render reads it directly. Behind an Arc because the render thread
    /// outlives the command that started it and still has to ask, at the end,
    /// whether the timeline moved while it was working.
    pub document: Arc<Mutex<Document>>,
    pub settings: Mutex<Settings>,
    /// Serialises only generation allocation and the final disk/state commit.
    /// Candidate preparation stays outside it so a later request can supersede
    /// one still waiting for its first frame.
    pub settings_transaction: Mutex<()>,
    pub settings_generation: AtomicU64,
    pub playback_settings: PlaybackSettingsGate,
    /// The running ffmpeg, so Cancel has something to kill. Shared with the
    /// thread that reads its progress.
    pub render: Arc<Mutex<Option<Child>>>,
    pub cancelled: Arc<AtomicBool>,
    /// Detecting the hardware encoder costs a few hundred milliseconds of
    /// subprocesses, and the answer cannot change while the app is running.
    /// None means it has not been asked yet.
    pub accel: Mutex<Option<AccelProbe>>,
    /// Opening a graphics device costs a moment and the answer never changes,
    /// so it is made once and shared. Keyed by backend and by the chosen
    /// adapter: asking for the CPU after the GPU has been opened should not
    /// hand back the GPU, and neither should asking for the other card.
    pub compositor: Mutex<Vec<((Backend, String), Arc<Compositor>)>>,
    /// The native monitor, when one is running. `None` is either the media
    /// element preview or nothing open yet, and the page is told which.
    pub playback: Mutex<Option<Arc<Session>>>,
    /// Invalidates a session that was being built when release/delete ran.
    /// The registry lock cannot cover `Session::start`, because surface and
    /// decoder startup must not block transport/status commands.
    pub playback_epoch: AtomicU64,
    pub proxies: Arc<Mutex<ProxyState>>,
    pub proxy_workers: Mutex<Vec<JoinHandle<()>>>,
    pub waveforms: Arc<Mutex<WaveformState>>,
    pub waveform_workers: Mutex<Vec<JoinHandle<()>>>,
}

#[derive(Debug, Default)]
pub struct ProxyState {
    project_path: String,
    entries: HashMap<String, ProxyStatus>,
}

#[derive(Debug, Default)]
pub struct WaveformState {
    project_path: String,
    entries: HashMap<String, WaveformStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformStatus {
    asset_id: String,
    state: String,
    buckets_per_second: u32,
    peaks: Vec<[f32; 2]>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    asset_id: String,
    state: String,
    percent: u8,
    path: String,
    reason: String,
    message: String,
}

fn proxy_status_entry(
    asset_id: impl Into<String>,
    state: &str,
    percent: u8,
    path: impl Into<String>,
    reason: impl Into<String>,
    message: impl Into<String>,
) -> ProxyStatus {
    ProxyStatus {
        asset_id: asset_id.into(),
        state: state.into(),
        percent,
        path: path.into(),
        reason: reason.into(),
        message: message.into(),
    }
}

/// Proxy jobs counted by state, for a status line that does not need every
/// asset: "ready", "generating", "queued" and so on.
pub(crate) fn proxy_counts(proxies: &ProxyState) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for status in proxies.entries.values() {
        *counts.entry(status.state.clone()).or_insert(0) += 1;
    }
    counts
}

fn proxy_statuses(proxies: &ProxyState) -> Vec<ProxyStatus> {
    let mut statuses: Vec<ProxyStatus> = proxies.entries.values().cloned().collect();
    statuses.sort_by(|a, b| a.asset_id.cmp(&b.asset_id));
    statuses
}

fn emit_proxy_status(app: &AppHandle, proxies: &Arc<Mutex<ProxyState>>) {
    let statuses = proxy_statuses(&proxies.lock().unwrap());
    let _ = app.emit("proxy:status", statuses);
}

fn waveform_statuses(waveforms: &WaveformState) -> Vec<WaveformStatus> {
    let mut statuses: Vec<WaveformStatus> = waveforms.entries.values().cloned().collect();
    statuses.sort_by(|a, b| a.asset_id.cmp(&b.asset_id));
    statuses
}

fn emit_waveform_status(app: &AppHandle, status: WaveformStatus) {
    let _ = app.emit("waveform:status", vec![status]);
}

fn ready_proxy_paths(proxies: &ProxyState) -> HashMap<String, String> {
    proxies
        .entries
        .iter()
        .filter(|(_, status)| status.state == "ready")
        .map(|(id, status)| (id.clone(), status.path.clone()))
        .collect()
}

/// One project folder found under the workspace root.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub dir: String,
    /// The project file inside it.
    pub path: String,
    /// Unix milliseconds, for sorting the Open list by most recent.
    pub modified_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub version: String,
    pub data_dir: String,
    pub log_dir: String,
    /// The workspace root as actually resolved, so the page can show it whether
    /// or not the user has set one.
    pub workspace: String,
    /// None when the tool could not be found, which the page turns into a
    /// banner rather than a failure at render time.
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub acceleration: AccelProbe,
    /// What is drawing frames, and whether it is a real graphics device.
    pub compositor: CompositorInfo,
    pub quality_project: Option<String>,
    pub quality_report: Option<String>,
    pub quality_smoke: bool,
}

pub fn allow_asset_file(app: &AppHandle, path: &str) {
    let _ = app.asset_protocol_scope().allow_file(path);
}

pub fn apply_theme(app: &AppHandle, theme: &str) {
    // Leaving the window theme as None is what keeps prefers-color-scheme
    // inside the webview following the OS. Pinning a value makes the window
    // ignore later OS changes.
    let wanted = match theme {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(wanted);
    }
}

/// The user's home directory as a plain string, for expanding a typed `~`.
fn home_dir(app: &AppHandle) -> String {
    app.path()
        .home_dir()
        .map(|dir| dir.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// The first candidate that is really a file. Every candidate is absolute, so
/// "not found" means not found rather than "there was a bare name at the end of
/// the list that always matched".
pub(crate) fn find_tool(app: &AppHandle, name: &str, configured: &str) -> Option<String> {
    let path_env = std::env::var("PATH").unwrap_or_default();
    tools::candidate_paths(name, configured, &path_env, &home_dir(app))
        .into_iter()
        .find(|candidate| Path::new(candidate).is_file())
}

/// Where project folders live. The setting wins; otherwise it is the Documents
/// folder, or the home folder on a system that has no Documents.
fn workspace_root(app: &AppHandle, settings: &Settings) -> PathBuf {
    // A path typed into a settings field is a path someone would type in a
    // shell, and the placeholder shows the default with a ~ in it.
    let configured = workspace::expand_home(&settings.workspace_dir, &home_dir(app));
    if !configured.is_empty() {
        return PathBuf::from(configured);
    }
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join(workspace::DEFAULT_FOLDER)
}

/// The project folders under the root, newest first. A directory without a
/// project file in it is somebody else's folder and is left alone.
#[tauri::command]
pub fn list_projects(app: AppHandle, state: State<AppState>) -> Vec<ProjectEntry> {
    let root = workspace_root(&app, &state.settings.lock().unwrap().clone());
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Vec::new();
    };
    let mut found: Vec<ProjectEntry> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let dir = entry.path();
            let file = dir.join(workspace::PROJECT_FILE);
            if !file.is_file() {
                return None;
            }
            let modified_ms = file
                .metadata()
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|since| since.as_millis() as u64)
                .unwrap_or(0);
            Some(ProjectEntry {
                name: dir.file_name()?.to_string_lossy().to_string(),
                dir: dir.to_string_lossy().to_string(),
                path: file.to_string_lossy().to_string(),
                modified_ms,
            })
        })
        .collect();
    found.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    found
}

/// Makes `<workspace>/<name>/` and reports where the project file will go.
/// Nothing is written into it yet; the first save does that.
#[tauri::command]
pub fn create_project(
    app: AppHandle,
    state: State<AppState>,
    name: String,
) -> Result<ProjectEntry, String> {
    let name = workspace::sanitize_project_name(&name)?;
    let root = workspace_root(&app, &state.settings.lock().unwrap().clone());
    let dir = root.join(&name);
    if dir.join(workspace::PROJECT_FILE).exists() {
        return Err(format!("a project called {name} is already there"));
    }
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    Ok(ProjectEntry {
        name,
        dir: dir.to_string_lossy().to_string(),
        path: dir
            .join(workspace::PROJECT_FILE)
            .to_string_lossy()
            .to_string(),
        modified_ms: 0,
    })
}

fn stop_proxy_workers(app: &AppHandle, state: &State<AppState>) {
    {
        let mut proxies = state.proxies.lock().unwrap();
        proxies.project_path.clear();
        proxies.entries.clear();
    }
    emit_proxy_status(app, &state.proxies);
    let workers = std::mem::take(&mut *state.proxy_workers.lock().unwrap());
    for worker in workers {
        let _ = worker.join();
    }
}

fn stop_waveform_workers(app: &AppHandle, state: &State<AppState>) {
    {
        let mut waveforms = state.waveforms.lock().unwrap();
        waveforms.project_path.clear();
        waveforms.entries.clear();
    }
    let _ = app.emit("waveform:status", Vec::<WaveformStatus>::new());
    let workers = std::mem::take(&mut *state.waveform_workers.lock().unwrap());
    for worker in workers {
        let _ = worker.join();
    }
}

fn move_to_trash(path: &Path) -> Result<(), String> {
    let mut context = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        context.set_delete_method(DeleteMethod::NsFileManager);
    }
    context
        .delete(path)
        .map_err(|error| format!("cannot move {path:?} to Trash: {error}"))
}

/// Move a managed project's configured deletion target to Trash. Imported
/// source media stays outside it and is untouched.
#[tauri::command]
pub fn delete_project(
    app: AppHandle,
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    project_path: String,
) -> Result<(), String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    if state.render.lock().unwrap().is_some() {
        return Err("wait for the active render to finish before deleting the project".into());
    }
    let settings = state.settings.lock().unwrap().clone();
    let root = workspace_root(&app, &settings);
    let dir = workspace::managed_project_dir(&root, Path::new(&project_path))?;
    let target = if settings.delete_project_folder {
        dir
    } else {
        dir.join(workspace::PROJECT_FILE)
    };

    state.playback_epoch.fetch_add(1, Ordering::SeqCst);
    let session = state.playback.lock().unwrap().take();
    if let Some(session) = session.as_ref() {
        session.stop();
    }
    drop(session);
    stop_proxy_workers(&app, &state);
    stop_waveform_workers(&app, &state);
    move_to_trash(&target)
}

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<AppState>) -> Bootstrap {
    let settings = state.settings.lock().unwrap().clone();
    let ffmpeg = find_tool(&app, "ffmpeg", &settings.ffmpeg_dir);
    Bootstrap {
        version: app.package_info().version.to_string(),
        data_dir: crate::store::data_dir(&app),
        log_dir: crate::store::log_dir(&app, &settings)
            .to_string_lossy()
            .to_string(),
        workspace: workspace_root(&app, &settings)
            .to_string_lossy()
            .to_string(),
        acceleration: acceleration(&state, ffmpeg.as_ref()),
        compositor: compositor_info(&state, &settings),
        ffprobe: find_tool(&app, "ffprobe", &settings.ffmpeg_dir),
        ffmpeg,
        settings,
        quality_project: std::env::var("AKBUN_MAKEVIDEO_QUALITY_PROJECT").ok(),
        quality_report: std::env::var("AKBUN_MAKEVIDEO_QUALITY_REPORT").ok(),
        quality_smoke: std::env::var("AKBUN_MAKEVIDEO_QUALITY_SMOKE").as_deref() == Ok("1"),
    }
}

#[tauri::command]
pub fn font_available(family: String) -> bool {
    makevideo_compositor::text::font_available(&family)
}

/// Every installed font family, for the text inspector's picker.
///
/// The first call builds the system font database, so it runs off the main
/// thread like every command below that reads files or spawns a process: a
/// synchronous command runs on the main thread and freezes the window.
#[tauri::command]
pub async fn list_fonts() -> Result<Vec<String>, String> {
    blocking(makevideo_compositor::text::font_families).await
}

#[tauri::command]
pub async fn validate_lut(path: String) -> Result<(), String> {
    blocking(move || makevideo_compositor::lut::Lut::from_cube_file(&path).map(|_| ())).await?
}

/// Run file or process work on the blocking pool and hand back its value.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("background task failed: {error}"))
}

/// One composited frame for the preview, drawn by the same shader the render
/// uses. Returns eight bytes of width and height then RGBA rows, which the page
/// blits straight onto a canvas.
///
/// Raw rather than an encoded image on purpose: the whole point is to show
/// exactly what the render will contain, and a lossy re-encode on the way to
/// the screen would undo that.
///
/// The timeline is read from the document rather than sent with the request.
/// That is the difference between an engine that can decide for itself what to
/// decode for a given frame and one that can only work from whatever snapshot
/// happened to come with the call.
///
/// The drawing runs on a blocking thread. Every part of it waits — an ffmpeg
/// process per visible clip, then the readback — and doing that on the async
/// runtime holds a worker for the whole job, which is long enough that the
/// playhead the page polls every frame stops coming back and the app reads as
/// hung. Nothing here is actually asynchronous; the command is `async` so that
/// it can hand the work somewhere it may block.
#[tauri::command]
pub async fn preview_frame(
    app: AppHandle,
    state: State<'_, AppState>,
    frame: i64,
    max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    // Cloned under the lock and used outside it: decoding a frame takes an
    // ffmpeg call per visible clip, and holding the edit for that long would
    // freeze every command the page sends in the meantime.
    let project = state.document.lock().unwrap().project().clone();
    let settings = state.settings.lock().unwrap().clone();
    let gpu = settings_compositor(&state, &settings);
    let configured = settings.ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so no frame can be decoded")?;

    // The preview is drawn at the project shape, scaled down to what the panel
    // can show. Same aspect, so the framing matches the render exactly.
    let settings = &project.settings;
    let width = max_width.clamp(16, settings.width.max(16));
    let height = ((width as u64 * settings.height.max(1) as u64) / settings.width.max(1) as u64)
        .max(2) as u32;
    let width = width - (width % 2);
    let height = height - (height % 2);

    let pixels = tauri::async_runtime::spawn_blocking(move || {
        makevideo_compositor::pipeline::preview_frame(
            &gpu,
            &ffmpeg_path,
            &project,
            frame,
            width,
            height,
        )
    })
    .await
    .map_err(|error| format!("the preview frame job did not finish: {error}"))??;
    let mut payload = Vec::with_capacity(pixels.len() + 8);
    payload.extend_from_slice(&width.to_le_bytes());
    payload.extend_from_slice(&height.to_le_bytes());
    payload.extend_from_slice(&pixels);
    Ok(tauri::ipc::Response::new(payload))
}

#[tauri::command]
pub fn report_error(
    app: AppHandle,
    state: State<AppState>,
    source: String,
    message: String,
) -> Result<(), String> {
    let settings = state.settings.lock().unwrap().clone();
    crate::store::append_error(&app, &settings, &source, &message)
}

fn probe_asset(ffprobe: Option<&String>, path: &str) -> probe::Probed {
    let Some(program) = ffprobe else {
        return probe::Probed::default();
    };
    let Ok(output) = Command::new(program).args(probe::args(path)).output() else {
        return probe::Probed::default();
    };
    probe::parse(&String::from_utf8_lossy(&output.stdout))
}

// --- the edit ---------------------------------------------------------------

/// What the page redraws from, right now.
#[tauri::command]
pub fn edit_state(state: State<AppState>) -> DocumentState {
    state.document.lock().unwrap().state()
}

/// Apply commands as one undo step, and hand back the new state.
///
/// A list rather than a single command because several edits often make up one
/// thing a user did — dropping three files lays down three clips — and undoing
/// that should take one press. Either all of them land or none do, so there is
/// no state where part of a drop happened.
#[tauri::command]
pub fn edit_apply(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    commands: Vec<Edit>,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let mut document = state.document.lock().unwrap();
    document.apply_all(commands)?;
    Ok(document.state())
}

#[tauri::command]
pub fn edit_undo(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let mut document = state.document.lock().unwrap();
    document.undo()?;
    Ok(document.state())
}

#[tauri::command]
pub fn edit_redo(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let mut document = state.document.lock().unwrap();
    document.redo()?;
    Ok(document.state())
}

/// An asset's real length and size, once a media element could measure them.
/// Only reached when there is no ffprobe to ask at import time.
#[tauri::command]
pub fn describe_asset(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    asset_id: String,
    duration_ms: u64,
    width: u32,
    height: u32,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let mut document = state.document.lock().unwrap();
    document.describe_asset(&asset_id, duration_ms, width, height)?;
    Ok(document.state())
}

/// Start again on an empty timeline, at whatever shape new projects are set to.
#[tauri::command]
pub fn new_document(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let settings = state.settings.lock().unwrap().clone();
    let mut document = state.document.lock().unwrap();
    *document = Document::new(ProjectSettings {
        width: settings.default_width,
        height: settings.default_height,
        rate: settings.default_rate,
    });
    Ok(document.state())
}

#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    state: State<'_, AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    path: String,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let (reader_app, reader_path) = (app.clone(), path.clone());
    let project = blocking(move || read_project(&reader_app, &configured, &reader_path)).await??;
    // The scope grant is in memory only, so a project opened in a new run has
    // to grant its media again or every preview is blank.
    for asset in &project.assets {
        allow_asset_file(&app, &asset.path);
    }
    let opened = {
        let mut document = state.document.lock().unwrap();
        // Opening starts a fresh history: undo goes back through this session, not
        // through the sessions that wrote the file.
        *document = Document::opened(project);
        document.state()
    };
    // A reopened project checks its waveform files again; saves reuse what
    // is already ready. Jobs still queued or running keep their entries so
    // they are not started a second time.
    state
        .waveforms
        .lock()
        .unwrap()
        .entries
        .retain(|_, status| status.state != "ready");
    let _ = start_waveforms_inner(app, &state, path);
    Ok(opened)
}

/// Parse a project file and measure its media again, one ffprobe per asset
/// spread over the cores. Opening a long edit was one probe after another.
fn read_project(app: &AppHandle, configured: &str, path: &str) -> Result<Project, String> {
    let text =
        std::fs::read_to_string(path).map_err(|error| format!("cannot open {path}: {error}"))?;
    let mut project: Project =
        serde_json::from_str(&text).map_err(|error| format!("{path} is not a project: {error}"))?;
    if let Some(ffprobe) = find_tool(app, "ffprobe", configured) {
        let workers = std::thread::available_parallelism().map_or(4, |count| count.get()).min(8);
        let chunk = project.assets.len().div_ceil(workers).max(1);
        std::thread::scope(|scope| {
            for assets in project.assets.chunks_mut(chunk) {
                let ffprobe = &ffprobe;
                scope.spawn(move || {
                    for asset in assets {
                        let measured = probe_asset(Some(ffprobe), &asset.path);
                        if measured.width > 0 && measured.height > 0 {
                            asset.width = measured.width;
                            asset.height = measured.height;
                        }
                        if measured.duration_ms > 0 {
                            asset.duration_ms = measured.duration_ms;
                        }
                        asset.has_audio = measured.has_audio;
                    }
                });
            }
        });
    }
    Ok(project)
}

/// Writes the project file and nothing else. In particular it does not copy a
/// single frame of media: the file holds absolute paths to whatever the user
/// imported, wherever that lives. See wiki/architecture/workspace-and-files.md.
///
/// What gets written is the document, not something the page sent along with
/// the request: there is one copy of the edit and this is the one that saves.
#[tauri::command]
pub fn save_project(
    app: AppHandle,
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    path: String,
) -> Result<(), String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let text = {
        let document = state.document.lock().unwrap();
        serde_json::to_string_pretty(document.project()).map_err(|error| error.to_string())?
    };
    // A project folder deleted from Finder between two saves should not lose
    // the edit that is in memory right now.
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {parent:?}: {error}"))?;
    }
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path}: {error}"))?;
    let _ = start_waveforms_inner(app, &state, path);
    Ok(())
}

mod settings;
pub use settings::*;
mod devices;
pub use devices::*;
mod proxy;
pub use proxy::*;
mod waveform;
pub use waveform::*;
mod srt;
pub use srt::*;
mod render;
pub use render::*;
mod metrics;
pub use metrics::*;
mod session;
pub use session::*;

#[cfg(test)]
mod tests;
