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

use crate::playback::{Config as PlaybackConfig, Session, Status as PlaybackStatus};
use crate::viewport::Place;
use makevideo_compositor::{Backend, Compositor};
// Aliased because this file also spawns processes, and two things called
// Command in one file is one too many.
use makevideo_edit::{Command as Edit, Document, DocumentState, ProjectSettings};
use makevideo_present::fallback::{choose, Choice};
use makevideo_render::accel::{self, Acceleration};
use makevideo_render::{ffmpeg, probe, tools, workspace, Asset, AssetKind, Project, Rate};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter, Manager, State};

/// Application settings, as opposed to the project settings that live in the
/// project file. These follow the user, not the edit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "system", "light" or "dark".
    pub theme: String,
    /// "full", "half" or "quarter". Half by default: the preview stacks real
    /// media elements, and at full size a few tracks at once will not keep up.
    pub preview_quality: String,
    /// Drop preview audio while the playhead is being dragged. Scrubbing with
    /// audio on means a seek per frame, which is what actually stalls playback.
    pub preview_mute_while_scrubbing: bool,
    /// Snap clips to nearby edges. Mirrors the magnet button in the timeline.
    pub snap: bool,
    /// The resolution a new project starts with.
    pub default_width: u32,
    pub default_height: u32,
    /// The timebase a new project starts on, as a ratio so 29.97 is a choice
    /// somebody can actually make. A settings file written before this was a
    /// ratio has `defaultFps` instead, which is not read: losing a preference
    /// is a smaller thing than opening a project on the wrong rate.
    pub default_rate: Rate,
    /// Where project folders are made. Empty means the default, which is
    /// ~/Documents/akbun-makevideo.
    pub workspace_dir: String,
    /// Folder holding ffmpeg and ffprobe. Empty means look in the usual places.
    pub ffmpeg_dir: String,
    /// "auto" to encode on the GPU when this machine has one that works, "cpu"
    /// to always use libx264. There is no "force GPU": if the hardware path
    /// fails there is nothing to do but use the CPU, so auto already covers it.
    pub render_acceleration: String,
    /// How a frame gets drawn: "auto" for the graphics device with the
    /// software compositor behind it, "cpu" to stay off the GPU entirely, or
    /// "ffmpeg" to let the filter graph draw instead. The first two are the
    /// same code and make the preview and the render agree; the third is
    /// faster because frames never leave ffmpeg.
    pub compositor: String,
    /// "native" to play on a graphics surface with the audio clock deciding
    /// when each frame is shown, "media-element" to stack `<video>` elements in
    /// the page as the app always has.
    ///
    /// Anything unrecognised is native, so a settings file written before this
    /// existed gets the new engine rather than being pinned to the old one.
    /// When the native engine cannot start — no graphics device, no window
    /// handle, a surface nobody can draw in — the app falls back on its own and
    /// says why.
    pub playback_engine: String,
    /// Use ready proxy files for preview and playback. Proxy creation remains
    /// automatic so disabling this changes only which media is read.
    pub proxy_enabled: bool,
    /// Delete the managed project folder with its work file. When disabled,
    /// only project.akbunvideo goes to Trash and derived files remain.
    pub delete_project_folder: bool,
    /// Empty uses the operating system's application log directory.
    pub log_dir: String,
    /// Maximum size of errors.log before it becomes errors.log.1.
    pub log_rotation_size: u64,
    /// "kb" or "mb".
    pub log_rotation_unit: String,
    /// User changes to the page's built-in keyboard shortcuts. Missing actions
    /// keep their code-defined defaults, so new actions reach existing users.
    pub shortcut_overrides: HashMap<String, Vec<String>>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            preview_quality: "half".into(),
            preview_mute_while_scrubbing: true,
            snap: true,
            default_width: 1920,
            default_height: 1080,
            default_rate: Rate::fps(30),
            workspace_dir: String::new(),
            ffmpeg_dir: String::new(),
            render_acceleration: "auto".into(),
            compositor: "auto".into(),
            playback_engine: "native".into(),
            proxy_enabled: true,
            delete_project_folder: true,
            log_dir: String::new(),
            log_rotation_size: 5,
            log_rotation_unit: "mb".into(),
            shortcut_overrides: HashMap::new(),
        }
    }
}

pub struct AppState {
    /// The edit. One copy, and this is it: the page draws what this says and
    /// the render reads it directly. Behind an Arc because the render thread
    /// outlives the command that started it and still has to ask, at the end,
    /// whether the timeline moved while it was working.
    pub document: Arc<Mutex<Document>>,
    pub settings: Mutex<Settings>,
    /// The running ffmpeg, so Cancel has something to kill. Shared with the
    /// thread that reads its progress.
    pub render: Arc<Mutex<Option<Child>>>,
    pub cancelled: Arc<AtomicBool>,
    /// Detecting the hardware encoder costs a few hundred milliseconds of
    /// subprocesses, and the answer cannot change while the app is running.
    /// None means it has not been asked yet.
    pub accel: Mutex<Option<AccelProbe>>,
    /// Opening a graphics device costs a moment and the answer never changes,
    /// so it is made once and shared. Keyed by backend, because asking for the
    /// CPU after the GPU has been opened should not hand back the GPU.
    pub compositor: Mutex<Vec<(Backend, Arc<Compositor>)>>,
    /// The native monitor, when one is running. `None` is either the media
    /// element preview or nothing open yet, and the page is told which.
    pub playback: Mutex<Option<Session>>,
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
    message: String,
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

/// One candidate and what happened when it was actually tried. Kept so Settings
/// can say why there is no hardware encoder instead of just saying there is
/// none.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriedCandidate {
    pub label: String,
    pub encoder: String,
    pub works: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelProbe {
    /// The first candidate whose trial encode succeeded.
    pub available: Option<Acceleration>,
    pub tried: Vec<TriedCandidate>,
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
fn find_tool(app: &AppHandle, name: &str, configured: &str) -> Option<String> {
    let path_env = std::env::var("PATH").unwrap_or_default();
    tools::candidate_paths(name, configured, &path_env, &home_dir(app))
        .into_iter()
        .find(|candidate| Path::new(candidate).is_file())
}

fn run_text(program: &str, args: Vec<String>) -> String {
    Command::new(program)
        .args(args)
        .output()
        .map(|out| {
            let mut text = String::from_utf8_lossy(&out.stdout).to_string();
            text.push_str(&String::from_utf8_lossy(&out.stderr));
            text
        })
        .unwrap_or_default()
}

/// Which hardware encoder this machine can really use.
///
/// `ffmpeg -encoders` only says what ffmpeg was built with — a Homebrew build
/// lists h264_nvenc on a Mac that has never seen an NVIDIA card. So the listing
/// picks the candidates and a one frame encode decides, which costs about 50 ms
/// each and is the whole difference between knowing and guessing.
fn detect_acceleration(program: &str) -> AccelProbe {
    let encoders = accel::parse_encoders(&run_text(program, accel::encoders_args()));
    let hwaccels = accel::parse_hwaccels(&run_text(program, accel::hwaccels_args()));

    let mut tried = Vec::new();
    let mut available = None;
    for candidate in accel::candidates(&encoders, &hwaccels) {
        let output = Command::new(program)
            .args(accel::trial_args(&candidate.encoder))
            .output();
        let (works, note) = match output {
            Ok(out) if out.status.success() => (true, String::new()),
            Ok(out) => (
                false,
                String::from_utf8_lossy(&out.stderr)
                    .lines()
                    .next()
                    .unwrap_or("the trial encode failed")
                    .to_string(),
            ),
            Err(error) => (false, error.to_string()),
        };
        tried.push(TriedCandidate {
            label: candidate.label.clone(),
            encoder: candidate.encoder.clone(),
            works,
            note,
        });
        if works && available.is_none() {
            available = Some(candidate);
        }
    }
    AccelProbe { available, tried }
}

/// Cached for the life of the app: the answer costs subprocesses and cannot
/// change while it is running.
fn acceleration(state: &State<AppState>, program: Option<&String>) -> AccelProbe {
    if let Some(cached) = state.accel.lock().unwrap().as_ref() {
        return cached.clone();
    }
    let probe = match program {
        Some(program) => detect_acceleration(program),
        None => AccelProbe {
            available: None,
            tried: Vec::new(),
        },
    };
    // Nothing was detected because ffmpeg is missing, so do not cache it: the
    // user may point Settings at it and expect the next render to pick it up.
    if program.is_some() {
        *state.accel.lock().unwrap() = Some(probe.clone());
    }
    probe
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositorInfo {
    /// "auto", "cpu" or "ffmpeg", as asked for.
    pub setting: String,
    /// What is actually drawing: a device name, or "software (CPU)".
    pub device: String,
    /// Whether that is a graphics device rather than the software path.
    pub gpu: bool,
    /// True when a graphics device was wanted and there was none, so the
    /// software compositor took over. The picture is the same either way.
    pub fell_back: bool,
}

/// Which backend a setting asks for. Anything that is not "cpu" means auto,
/// including the "gpu" that older settings files hold: a machine with no
/// device should quietly use the software path, not refuse to draw.
fn wanted_backend(setting: &str) -> Backend {
    if setting == "cpu" {
        Backend::Cpu
    } else {
        Backend::Auto
    }
}

/// The compositor for a backend, made once and shared. This never fails: with
/// no graphics device the software compositor draws the same picture, only
/// slower, so "no GPU" stopped being a reason to give up.
fn compositor(state: &State<AppState>, backend: Backend) -> Arc<Compositor> {
    let mut made = state.compositor.lock().unwrap();
    if let Some((_, existing)) = made.iter().find(|(kind, _)| *kind == backend) {
        return Arc::clone(existing);
    }
    let built = Arc::new(Compositor::with_backend(backend).unwrap_or_else(|_| Compositor::new()));
    made.push((backend, Arc::clone(&built)));
    built
}

fn compositor_info(state: &State<AppState>, setting: &str) -> CompositorInfo {
    if setting == "ffmpeg" {
        return CompositorInfo {
            setting: setting.to_string(),
            device: "ffmpeg filter graph".into(),
            gpu: false,
            fell_back: false,
        };
    }
    let backend = wanted_backend(setting);
    let made = compositor(state, backend);
    CompositorInfo {
        setting: setting.to_string(),
        device: made.adapter().to_string(),
        gpu: made.is_gpu(),
        fell_back: backend == Backend::Auto && !made.is_gpu(),
    }
}

/// What this render should use, honouring the setting.
fn chosen_acceleration(app: &AppHandle, state: &State<AppState>) -> Option<Acceleration> {
    let settings = state.settings.lock().unwrap().clone();
    if settings.render_acceleration == "cpu" {
        return None;
    }
    let program = find_tool(app, "ffmpeg", &settings.ffmpeg_dir);
    acceleration(state, program.as_ref()).available
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
    project_path: String,
) -> Result<(), String> {
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

    let session = state.playback.lock().unwrap().take();
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
        compositor: compositor_info(&state, &settings.compositor),
        ffprobe: find_tool(&app, "ffprobe", &settings.ffmpeg_dir),
        ffmpeg,
        settings,
        quality_project: std::env::var("AKBUN_MAKEVIDEO_QUALITY_PROJECT").ok(),
        quality_report: std::env::var("AKBUN_MAKEVIDEO_QUALITY_REPORT").ok(),
        quality_smoke: std::env::var("AKBUN_MAKEVIDEO_QUALITY_SMOKE").as_deref() == Ok("1"),
    }
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
#[tauri::command]
pub fn preview_frame(
    app: AppHandle,
    state: State<AppState>,
    frame: i64,
    max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    // Cloned under the lock and used outside it: decoding a frame takes an
    // ffmpeg call per visible clip, and holding the edit for that long would
    // freeze every command the page sends in the meantime.
    let project = state.document.lock().unwrap().project().clone();
    let settings = state.settings.lock().unwrap().clone();
    let gpu = compositor(&state, wanted_backend(&settings.compositor));
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

    let pixels = makevideo_compositor::pipeline::preview_frame(
        &gpu,
        &ffmpeg_path,
        &project,
        frame,
        width,
        height,
    )?;
    let mut payload = Vec::with_capacity(pixels.len() + 8);
    payload.extend_from_slice(&width.to_le_bytes());
    payload.extend_from_slice(&height.to_le_bytes());
    payload.extend_from_slice(&pixels);
    Ok(tauri::ipc::Response::new(payload))
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Bootstrap, String> {
    crate::store::prepare_log_dir(&app, &settings)?;
    apply_theme(&app, &settings.theme);
    crate::store::save_settings(&app, &settings)?;
    {
        let mut current = state.settings.lock().unwrap();
        // Pointing at a different ffmpeg means a different set of encoders, so
        // the cached answer is about the wrong binary.
        if current.ffmpeg_dir != settings.ffmpeg_dir {
            *state.accel.lock().unwrap() = None;
        }
        *current = settings;
    }
    Ok(bootstrap(app, state))
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

/// Files dropped on the window or picked in the dialog. Anything whose
/// extension is not media is skipped rather than imported as a broken row.
///
/// A file whose length ffprobe could not report comes back with durationMs 0;
/// the page fills it in from the media element once it loads, so the app still
/// works with no ffmpeg installed right up to the point of rendering.
#[tauri::command]
pub fn import_assets(app: AppHandle, state: State<AppState>, paths: Vec<String>) -> Vec<Asset> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffprobe = find_tool(&app, "ffprobe", &configured);
    let mut assets = Vec::new();
    for path in paths {
        let Some(kind) = AssetKind::from_path(&path) else {
            continue;
        };
        if !Path::new(&path).is_file() {
            continue;
        }
        allow_asset_file(&app, &path);
        let probed = probe_asset(ffprobe.as_ref(), &path);
        assets.push(Asset {
            id: makevideo_render::asset_id(&path),
            name: Path::new(&path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone()),
            kind,
            duration_ms: probed.duration_ms,
            width: probed.width,
            height: probed.height,
            has_audio: probed.has_audio,
            path,
        });
    }
    assets
}

fn set_proxy_status(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    status: ProxyStatus,
) -> bool {
    let mut current = proxies.lock().unwrap();
    if current.project_path != project_path {
        return false;
    }
    current.entries.insert(status.asset_id.clone(), status);
    drop(current);
    emit_proxy_status(app, proxies);
    true
}

fn make_proxy(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    ffmpeg_path: &str,
    asset: &Asset,
) -> Result<String, String> {
    let output = makevideo_proxy::media_path(project_path, &asset.id)?;
    let temporary = output.with_extension("part.mp4");
    let args = makevideo_proxy::ffmpeg_args(asset, &temporary);
    let mut child = Command::new(ffmpeg_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(ffmpeg::Progress::Position(position_ms)) =
                ffmpeg::parse_progress_line(&line)
            {
                let percent = if asset.duration_ms > 0 {
                    ((position_ms.min(asset.duration_ms) * 100) / asset.duration_ms) as u8
                } else {
                    0
                };
                if !set_proxy_status(
                    app,
                    proxies,
                    project_path,
                    ProxyStatus {
                        asset_id: asset.id.clone(),
                        state: "generating".into(),
                        percent,
                        path: String::new(),
                        message: String::new(),
                    },
                ) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("the project changed".into());
                }
            }
        }
    }
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        let _ = std::fs::remove_file(&temporary);
        return Err("ffmpeg could not create the proxy".into());
    }
    if output.exists() {
        std::fs::remove_file(&output)
            .map_err(|error| format!("cannot replace {output:?}: {error}"))?;
    }
    std::fs::rename(&temporary, &output)
        .map_err(|error| format!("cannot move {temporary:?} to {output:?}: {error}"))?;
    makevideo_proxy::write_manifest(project_path, asset)?;
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
pub fn proxy_status(state: State<AppState>) -> Vec<ProxyStatus> {
    proxy_statuses(&state.proxies.lock().unwrap())
}

#[tauri::command]
pub fn start_proxies(
    app: AppHandle,
    state: State<AppState>,
    project_path: String,
) -> Result<Vec<ProxyStatus>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so proxies cannot be created")?;
    let project = state.document.lock().unwrap().project().clone();
    let mut jobs = Vec::new();
    {
        let mut proxies = state.proxies.lock().unwrap();
        if proxies.project_path != project_path {
            proxies.project_path = project_path.clone();
            proxies.entries.clear();
        }
        let wanted: HashSet<String> = project
            .assets
            .iter()
            .filter(|asset| makevideo_proxy::needs_proxy(asset))
            .map(|asset| asset.id.clone())
            .collect();
        proxies.entries.retain(|id, _| wanted.contains(id));
        for asset in project
            .assets
            .iter()
            .filter(|asset| wanted.contains(&asset.id))
        {
            if let Some(path) = makevideo_proxy::valid_proxy(&project_path, asset) {
                allow_asset_file(&app, &path);
                proxies.entries.insert(
                    asset.id.clone(),
                    ProxyStatus {
                        asset_id: asset.id.clone(),
                        state: "ready".into(),
                        percent: 100,
                        path,
                        message: String::new(),
                    },
                );
            } else if !matches!(
                proxies
                    .entries
                    .get(&asset.id)
                    .map(|status| status.state.as_str()),
                Some("queued" | "generating")
            ) {
                proxies.entries.insert(
                    asset.id.clone(),
                    ProxyStatus {
                        asset_id: asset.id.clone(),
                        state: "queued".into(),
                        percent: 0,
                        path: String::new(),
                        message: String::new(),
                    },
                );
                jobs.push(asset.clone());
            }
        }
    }
    emit_proxy_status(&app, &state.proxies);

    if !jobs.is_empty() {
        let proxies = Arc::clone(&state.proxies);
        let worker = std::thread::spawn(move || {
            if let Ok(dir) = makevideo_proxy::proxy_dir(&project_path) {
                if let Err(error) = std::fs::create_dir_all(&dir) {
                    for asset in jobs {
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            ProxyStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                percent: 0,
                                path: String::new(),
                                message: error.to_string(),
                            },
                        );
                    }
                    return;
                }
            }
            for asset in jobs {
                if !set_proxy_status(
                    &app,
                    &proxies,
                    &project_path,
                    ProxyStatus {
                        asset_id: asset.id.clone(),
                        state: "generating".into(),
                        percent: 0,
                        path: String::new(),
                        message: String::new(),
                    },
                ) {
                    return;
                }
                match make_proxy(&app, &proxies, &project_path, &ffmpeg_path, &asset) {
                    Ok(path) => {
                        allow_asset_file(&app, &path);
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            ProxyStatus {
                                asset_id: asset.id,
                                state: "ready".into(),
                                percent: 100,
                                path,
                                message: String::new(),
                            },
                        );
                    }
                    Err(message) if message == "the project changed" => return,
                    Err(message) => {
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            ProxyStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                percent: 0,
                                path: String::new(),
                                message,
                            },
                        );
                    }
                }
            }
        });
        let mut workers = state.proxy_workers.lock().unwrap();
        workers.retain(|worker| !worker.is_finished());
        workers.push(worker);
    }
    Ok(proxy_statuses(&state.proxies.lock().unwrap()))
}

fn set_waveform_status(
    app: &AppHandle,
    waveforms: &Arc<Mutex<WaveformState>>,
    project_path: &str,
    status: WaveformStatus,
) -> bool {
    let mut current = waveforms.lock().unwrap();
    if current.project_path != project_path {
        return false;
    }
    current
        .entries
        .insert(status.asset_id.clone(), status.clone());
    drop(current);
    emit_waveform_status(app, status);
    true
}

fn decode_waveform(ffmpeg_path: &str, asset: &Asset) -> Result<Vec<[f32; 2]>, String> {
    let mut child = Command::new(ffmpeg_path)
        .args(makevideo_waveform::ffmpeg_args(asset))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    let mut output = child.stdout.take().ok_or("ffmpeg did not provide audio")?;
    let mut buffer = [0_u8; 16_384];
    let mut pending = None;
    let mut peaks = makevideo_waveform::PeakBuilder::new();
    loop {
        let read = output
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        let mut at = 0;
        if let Some(low) = pending.take() {
            peaks.push(i16::from_le_bytes([low, buffer[0]]));
            at = 1;
        }
        while at + 1 < read {
            peaks.push(i16::from_le_bytes([buffer[at], buffer[at + 1]]));
            at += 2;
        }
        if at < read {
            pending = Some(buffer[at]);
        }
    }
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("ffmpeg could not decode the waveform".into());
    }
    Ok(peaks.finish())
}

#[tauri::command]
pub fn waveform_status(state: State<AppState>) -> Vec<WaveformStatus> {
    waveform_statuses(&state.waveforms.lock().unwrap())
}

#[tauri::command]
pub fn start_waveforms(
    app: AppHandle,
    state: State<AppState>,
    project_path: String,
) -> Result<Vec<WaveformStatus>, String> {
    start_waveforms_inner(app, &state, project_path)
}

fn start_waveforms_inner(
    app: AppHandle,
    state: &AppState,
    project_path: String,
) -> Result<Vec<WaveformStatus>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so waveforms cannot be created")?;
    let project = state.document.lock().unwrap().project().clone();
    let mut jobs = Vec::new();
    {
        let mut waveforms = state.waveforms.lock().unwrap();
        if waveforms.project_path != project_path {
            waveforms.project_path = project_path.clone();
            waveforms.entries.clear();
        }
        let wanted: HashSet<String> = project
            .assets
            .iter()
            .filter(|asset| makevideo_waveform::needs_waveform(asset))
            .map(|asset| asset.id.clone())
            .collect();
        waveforms.entries.retain(|id, _| wanted.contains(id));
        for asset in project
            .assets
            .iter()
            .filter(|asset| wanted.contains(&asset.id))
        {
            if let Some(waveform) = makevideo_waveform::read_valid(&project_path, asset) {
                waveforms.entries.insert(
                    asset.id.clone(),
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "ready".into(),
                        buckets_per_second: waveform.buckets_per_second,
                        peaks: waveform.peaks,
                        message: String::new(),
                    },
                );
            } else if !matches!(
                waveforms
                    .entries
                    .get(&asset.id)
                    .map(|status| status.state.as_str()),
                Some("queued" | "generating")
            ) {
                waveforms.entries.insert(
                    asset.id.clone(),
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "queued".into(),
                        buckets_per_second: makevideo_waveform::BUCKETS_PER_SECOND as u32,
                        peaks: Vec::new(),
                        message: String::new(),
                    },
                );
                jobs.push(asset.clone());
            }
        }
    }
    if !jobs.is_empty() {
        let waveforms = Arc::clone(&state.waveforms);
        let worker = std::thread::spawn(move || {
            let dir = match makevideo_waveform::waveform_dir(&project_path) {
                Ok(dir) => dir,
                Err(message) => {
                    for asset in jobs {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                buckets_per_second: 0,
                                peaks: Vec::new(),
                                message: message.clone(),
                            },
                        );
                    }
                    return;
                }
            };
            if let Err(error) = std::fs::create_dir_all(dir) {
                for asset in jobs {
                    set_waveform_status(
                        &app,
                        &waveforms,
                        &project_path,
                        WaveformStatus {
                            asset_id: asset.id,
                            state: "failed".into(),
                            buckets_per_second: 0,
                            peaks: Vec::new(),
                            message: error.to_string(),
                        },
                    );
                }
                return;
            }
            for asset in jobs {
                if !set_waveform_status(
                    &app,
                    &waveforms,
                    &project_path,
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "generating".into(),
                        buckets_per_second: makevideo_waveform::BUCKETS_PER_SECOND as u32,
                        peaks: Vec::new(),
                        message: String::new(),
                    },
                ) {
                    return;
                }
                let result = decode_waveform(&ffmpeg_path, &asset)
                    .and_then(|peaks| makevideo_waveform::write(&project_path, &asset, peaks));
                match result {
                    Ok(waveform) => {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "ready".into(),
                                buckets_per_second: waveform.buckets_per_second,
                                peaks: waveform.peaks,
                                message: String::new(),
                            },
                        );
                    }
                    Err(message) => {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                buckets_per_second: 0,
                                peaks: Vec::new(),
                                message,
                            },
                        );
                    }
                }
            }
        });
        let mut workers = state.waveform_workers.lock().unwrap();
        workers.retain(|worker| !worker.is_finished());
        workers.push(worker);
    }
    Ok(waveform_statuses(&state.waveforms.lock().unwrap()))
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
pub fn edit_apply(state: State<AppState>, commands: Vec<Edit>) -> Result<DocumentState, String> {
    let mut document = state.document.lock().unwrap();
    document.apply_all(commands)?;
    Ok(document.state())
}

#[tauri::command]
pub fn edit_undo(state: State<AppState>) -> Result<DocumentState, String> {
    let mut document = state.document.lock().unwrap();
    document.undo()?;
    Ok(document.state())
}

#[tauri::command]
pub fn edit_redo(state: State<AppState>) -> Result<DocumentState, String> {
    let mut document = state.document.lock().unwrap();
    document.redo()?;
    Ok(document.state())
}

/// An asset's real length and size, once a media element could measure them.
/// Only reached when there is no ffprobe to ask at import time.
#[tauri::command]
pub fn describe_asset(
    state: State<AppState>,
    asset_id: String,
    duration_ms: u64,
    width: u32,
    height: u32,
) -> Result<DocumentState, String> {
    let mut document = state.document.lock().unwrap();
    document.describe_asset(&asset_id, duration_ms, width, height)?;
    Ok(document.state())
}

/// Start again on an empty timeline, at whatever shape new projects are set to.
#[tauri::command]
pub fn new_document(state: State<AppState>) -> DocumentState {
    let settings = state.settings.lock().unwrap().clone();
    let mut document = state.document.lock().unwrap();
    *document = Document::new(ProjectSettings {
        width: settings.default_width,
        height: settings.default_height,
        rate: settings.default_rate,
    });
    document.state()
}

#[tauri::command]
pub fn open_project(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<DocumentState, String> {
    let text =
        std::fs::read_to_string(&path).map_err(|error| format!("cannot open {path}: {error}"))?;
    let project: Project =
        serde_json::from_str(&text).map_err(|error| format!("{path} is not a project: {error}"))?;
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
    let _ = start_waveforms_inner(app, &state, path);
    Ok(opened)
}

/// Writes the project file and nothing else. In particular it does not copy a
/// single frame of media: the file holds absolute paths to whatever the user
/// imported, wherever that lives. See wiki/architecture/workspace-and-files.md.
///
/// What gets written is the document, not something the page sent along with
/// the request: there is one copy of the edit and this is the one that saves.
#[tauri::command]
pub fn save_project(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderProgress {
    position_ms: u64,
    total_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderDone {
    ok: bool,
    cancelled: bool,
    path: String,
    message: String,
    /// The hardware attempt failed and the CPU finished the job.
    fell_back: bool,
    /// What did the encoding, empty when it was the CPU.
    accelerator: String,
    /// The timeline was edited while this was running, so the file is the
    /// timeline as it stood when the render started. This is what the revision
    /// number is for: without it the app would have to either refuse to edit
    /// during a render or quietly let somebody believe the output matches what
    /// is on screen.
    edited: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderFallback {
    from: String,
}

/// ffmpeg's own error text, trimmed to something a dialog can hold.
fn tail(text: &str) -> String {
    let trimmed = text.trim();
    match trimmed.char_indices().nth_back(2000) {
        Some((index, _)) => format!("…{}", &trimmed[index..]),
        None => trimmed.to_string(),
    }
}

struct Outcome {
    ok: bool,
    cancelled: bool,
    message: String,
}

/// Runs ffmpeg to completion, emitting progress as it goes. Blocks, so it is
/// only ever called from the render thread.
fn run_ffmpeg(
    app: &AppHandle,
    shared: &Arc<Mutex<Option<Child>>>,
    cancelled: &Arc<AtomicBool>,
    program: &str,
    args: &[String],
    total_ms: u64,
) -> Outcome {
    let spawned = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match spawned {
        Ok(child) => child,
        Err(error) => {
            return Outcome {
                ok: false,
                cancelled: false,
                message: format!("cannot start {program}: {error}"),
            }
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *shared.lock().unwrap() = Some(child);

    // stderr has to be drained even when nobody reads it, or a chatty failure
    // fills the pipe and ffmpeg blocks on a write that never completes.
    let errors = Arc::new(Mutex::new(String::new()));
    let drain = stderr.map(|mut stderr| {
        let errors = Arc::clone(&errors);
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *errors.lock().unwrap() = text;
        })
    });

    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(ffmpeg::Progress::Position(position_ms)) =
                ffmpeg::parse_progress_line(&line)
            {
                let _ = app.emit(
                    "render:progress",
                    RenderProgress {
                        position_ms: position_ms.min(total_ms),
                        total_ms,
                    },
                );
            }
        }
    }
    // The pipe closed, so ffmpeg has either finished or been killed.
    let status = shared
        .lock()
        .unwrap()
        .take()
        .and_then(|mut child| child.wait().ok());
    if let Some(handle) = drain {
        let _ = handle.join();
    }

    let was_cancelled = cancelled.load(Ordering::SeqCst);
    let ok = !was_cancelled && status.map(|status| status.success()).unwrap_or(false);
    let message = if ok {
        String::new()
    } else if was_cancelled {
        "Render cancelled.".into()
    } else {
        let text = errors.lock().unwrap().clone();
        if text.trim().is_empty() {
            "ffmpeg stopped without writing the file.".into()
        } else {
            tail(&text)
        }
    };
    Outcome {
        ok,
        cancelled: was_cancelled,
        message,
    }
}

/// How one attempt at a render turned out.
enum Attempt {
    Done,
    Cancelled,
    Failed(String),
}

/// One way of producing the file. The composited route draws every frame with
/// the same shader the preview uses; the graph route leaves the picture inside
/// ffmpeg and is faster because the frames never cross a pipe.
enum Route {
    Composited {
        label: String,
        accel: Option<Acceleration>,
    },
    Graph {
        label: String,
        args: Vec<String>,
    },
}

impl Route {
    fn label(&self) -> &str {
        match self {
            Route::Composited { label, .. } | Route::Graph { label, .. } => label,
        }
    }
}

/// Starts a render and returns as soon as it is under way. Progress arrives as
/// `render:progress` events and the outcome as one `render:done`.
///
/// Everything that can fail on a bad project is built here, synchronously, so
/// the dialog never opens on a render that was never going to start. Each route
/// is then tried in turn: anything that fails without being cancelled falls
/// back to the plain ffmpeg filter graph on the CPU, which is the combination
/// with the fewest moving parts.
#[tauri::command]
pub fn start_render(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    preset: String,
) -> Result<(), String> {
    if state.render.lock().unwrap().is_some() {
        return Err("a render is already running".into());
    }
    // The timeline as it stands now, and the revision it stands at. A render
    // takes minutes and the app stays editable throughout, so what goes into
    // the file is this copy and the number is how the end of the job finds out
    // whether it is still what the user is looking at.
    let (project, started_at) = {
        let document = state.document.lock().unwrap();
        (document.project().clone(), document.revision())
    };
    let preset = ffmpeg::Preset::parse(&preset)?;
    // Only the progress bar wants this; every decision below is in frames.
    let total_ms = project.duration().to_millis().max(0) as u64;
    let settings = state.settings.lock().unwrap().clone();
    let program = find_tool(&app, "ffmpeg", &settings.ffmpeg_dir).ok_or_else(|| {
        "ffmpeg was not found. Install it with `brew install ffmpeg`, or point Settings at the \
         folder that holds it."
            .to_string()
    })?;

    let chosen = chosen_acceleration(&app, &state);
    let accel_label = chosen
        .as_ref()
        .map(|hardware| hardware.label.clone())
        .unwrap_or_else(|| "CPU".into());
    let gpu = if settings.compositor == "ffmpeg" {
        None
    } else {
        Some(compositor(&state, wanted_backend(&settings.compositor)))
    };

    let mut routes: Vec<Route> = Vec::new();
    if let Some(gpu) = gpu.as_ref() {
        // Validated now so a broken project fails before the sheet opens.
        ffmpeg::encoder_args(&project, &path, preset, chosen.as_ref())?;
        routes.push(Route::Composited {
            label: format!("{} compositor, {accel_label} encoder", gpu.adapter()),
            accel: chosen.clone(),
        });
    } else if let Some(hardware) = chosen.as_ref() {
        routes.push(Route::Graph {
            label: format!("ffmpeg filter graph, {accel_label} encoder"),
            args: ffmpeg::build_args(&project, &path, preset, Some(hardware))?,
        });
    }
    let plain = ffmpeg::build_args(&project, &path, preset, None)?;
    routes.push(Route::Graph {
        label: "ffmpeg filter graph, CPU encoder".into(),
        args: plain,
    });

    state.cancelled.store(false, Ordering::SeqCst);
    let shared = Arc::clone(&state.render);
    let cancelled = Arc::clone(&state.cancelled);
    let document = Arc::clone(&state.document);

    std::thread::spawn(move || {
        let mut fell_back = false;
        let mut used = String::new();
        let mut outcome = Attempt::Failed("no route was tried".into());

        for (index, route) in routes.iter().enumerate() {
            if index > 0 {
                fell_back = true;
                let _ = app.emit(
                    "render:fallback",
                    RenderFallback {
                        from: routes[index - 1].label().to_string(),
                    },
                );
            }
            used = route.label().to_string();
            outcome = match route {
                Route::Composited { accel, .. } => {
                    let gpu = gpu.as_ref().expect("a composited route needs a device");
                    let emit = |position_ms: u64, total: u64| {
                        let _ = app.emit(
                            "render:progress",
                            RenderProgress {
                                position_ms,
                                total_ms: total,
                            },
                        );
                    };
                    match makevideo_compositor::pipeline::run(
                        gpu,
                        makevideo_compositor::pipeline::Options {
                            ffmpeg: &program,
                            project: &project,
                            output: &path,
                            preset,
                            accel: accel.as_ref(),
                        },
                        &shared,
                        &cancelled,
                        emit,
                    ) {
                        Ok(()) => Attempt::Done,
                        Err(error) if cancelled.load(Ordering::SeqCst) => {
                            let _ = error;
                            Attempt::Cancelled
                        }
                        Err(error) => Attempt::Failed(error),
                    }
                }
                Route::Graph { args, .. } => {
                    let result = run_ffmpeg(&app, &shared, &cancelled, &program, args, total_ms);
                    if result.cancelled {
                        Attempt::Cancelled
                    } else if result.ok {
                        Attempt::Done
                    } else {
                        Attempt::Failed(result.message)
                    }
                }
            };
            if matches!(outcome, Attempt::Done | Attempt::Cancelled) {
                break;
            }
        }

        cancelled.store(false, Ordering::SeqCst);
        let (ok, was_cancelled, message) = match outcome {
            Attempt::Done => (true, false, String::new()),
            Attempt::Cancelled => (false, true, "Render cancelled.".to_string()),
            Attempt::Failed(error) => (false, false, tail(&error)),
        };
        let _ = app.emit(
            "render:done",
            RenderDone {
                ok,
                cancelled: was_cancelled,
                path,
                message,
                fell_back: fell_back && ok,
                accelerator: if ok { used } else { String::new() },
                edited: ok && document.lock().unwrap().revision() != started_at,
            },
        );
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_render(state: State<AppState>) {
    state.cancelled.store(true, Ordering::SeqCst);
    if let Some(child) = state.render.lock().unwrap().as_mut() {
        let _ = child.kill();
    }
}

fn process_tree_rss_bytes(output: &str, root: u32) -> u64 {
    let rows: Vec<(u32, u32, u64)> = output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some((
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
            ))
        })
        .collect();
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut rss = HashMap::new();
    for (pid, parent, kib) in rows {
        children.entry(parent).or_default().push(pid);
        rss.insert(pid, kib);
    }
    let mut pending = vec![root];
    let mut found = HashSet::new();
    while let Some(pid) = pending.pop() {
        if !found.insert(pid) {
            continue;
        }
        if let Some(next) = children.get(&pid) {
            pending.extend(next);
        }
    }
    found
        .iter()
        .filter_map(|pid| rss.get(pid))
        .sum::<u64>()
        .saturating_mul(1024)
}

/// Resident memory for the app and its webview/helper children. The quality
/// harness samples the whole process tree because decoder memory does not live
/// solely in the Rust process.
#[tauri::command]
pub fn process_memory_bytes() -> Result<u64, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,ppid=,rss="])
        .output()
        .map_err(|error| format!("cannot read process memory: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(process_tree_rss_bytes(
        &String::from_utf8_lossy(&output.stdout),
        std::process::id(),
    ))
}

#[tauri::command]
pub fn save_quality_report(path: String, report: serde_json::Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path}: {error}"))
}

/// What the page gets back when it asks for the monitor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackChoice {
    /// "native" or "media-element". The page runs the old preview for the
    /// second one and leaves the transport to Rust for the first.
    pub engine: String,
    /// Why it is not native, when the setting asked for native and it could not
    /// start. `None` when nothing went wrong, including when the media element
    /// preview was simply chosen — a preference is not a failure.
    pub fell_back: Option<String>,
    pub status: Option<PlaybackStatus>,
}

impl PlaybackChoice {
    fn from(choice: Choice, status: Option<PlaybackStatus>) -> PlaybackChoice {
        PlaybackChoice {
            engine: choice.engine.as_str().to_string(),
            fell_back: choice.fell_back,
            status,
        }
    }
}

/// Start the native monitor on a view at `place`, or say why it could not.
///
/// The page calls this when a project opens and whenever the setting changes,
/// and it acts on the answer: `native` means the transport commands below are
/// the playhead, `media-element` means the page's own preview is.
///
/// This never returns an error. A monitor that will not start is a fallback and
/// not a failure — playback is the app's main path, and an editor that refuses
/// to open because a graphics device is missing is worse than one that plays
/// the way it always has.
#[tauri::command]
pub fn playback_attach(
    window: tauri::WebviewWindow,
    state: State<AppState>,
    place: Place,
    frame: i64,
) -> PlaybackChoice {
    let settings = state.settings.lock().unwrap().clone();
    // Already running: place it and hand back what it is doing. The page asks
    // again on every layout change, and tearing the session down to build the
    // same one would restart the decoders every time somebody dragged a panel.
    if let Some(session) = state.playback.lock().unwrap().as_ref() {
        session.place(place);
        return PlaybackChoice::from(Choice::native(), Some(session.status()));
    }

    // The setting is read before anything is built. Starting a session and
    // then throwing it away because the setting said media elements would put a
    // native view on screen for as long as it took to notice, which is a flash
    // of the wrong picture over the stage.
    if makevideo_present::Engine::parse(&settings.playback_engine)
        == makevideo_present::Engine::MediaElement
    {
        return PlaybackChoice::from(choose(&settings.playback_engine, Ok(())), None);
    }

    let started = start_session(&window, &state, &settings, place, frame);
    let (session, outcome) = match started {
        Ok(session) => (Some(session), Ok(())),
        Err(reason) => (None, Err(reason)),
    };
    let choice = choose(&settings.playback_engine, outcome);
    let status = session.as_ref().map(|session| session.status());
    *state.playback.lock().unwrap() = session;
    PlaybackChoice::from(choice, status)
}

fn start_session(
    window: &tauri::WebviewWindow,
    state: &State<AppState>,
    settings: &Settings,
    place: Place,
    frame: i64,
) -> Result<Session, String> {
    if !place.is_visible() {
        return Err("the monitor has no room on screen yet".into());
    }
    let project = state.document.lock().unwrap().project().clone();
    let ffmpeg = find_tool(&window.app_handle().clone(), "ffmpeg", &settings.ffmpeg_dir)
        .ok_or("ffmpeg was not found, so nothing can be decoded")?;
    // The monitor draws the project's own frame, the same one the render
    // writes. What differs is only how big the view showing it is, which the
    // surface handles by scaling on presentation.
    let compositor = compositor(state, wanted_backend(&settings.compositor));
    let proxy_paths = if settings.proxy_enabled {
        ready_proxy_paths(&state.proxies.lock().unwrap())
    } else {
        HashMap::new()
    };
    let config = PlaybackConfig::new(
        compositor,
        ffmpeg,
        project.settings.width.max(2),
        project.settings.height.max(2),
    )
    .with_proxies(proxy_paths);
    Session::start(
        window,
        Arc::clone(&state.document),
        config,
        place,
        frame.max(0),
    )
}

/// Stop the native monitor and take its view down. The page falls back to its
/// own preview until it attaches again.
#[tauri::command]
pub fn playback_release(state: State<AppState>) {
    // Dropped outside the lock: taking the session down joins its thread, and
    // holding the lock through that would block every other command.
    let session = state.playback.lock().unwrap().take();
    drop(session);
}

#[tauri::command]
pub fn playback_play(state: State<AppState>) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.play())
}

#[tauri::command]
pub fn playback_pause(state: State<AppState>) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.pause())
}

#[tauri::command]
pub fn playback_seek(state: State<AppState>, frame: i64) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.seek(frame.max(0)))
}

/// The timeline changed. A stopped playhead redraws its frame; a playing one
/// ignores it, because the frame source is already reading the edit it was
/// built from and rebuilding mid-playback would be a stall.
#[tauri::command]
pub fn playback_redraw(state: State<AppState>) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.redraw())
}

#[tauri::command]
pub fn playback_place(state: State<AppState>, place: Place) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.place(place))
}

/// Show or hide the monitor's view.
///
/// The page calls this when it is about to draw over the stage — a settings
/// sheet, an open menu — because a native view sits over the webview and is not
/// in the page's stacking order. Playback carries on behind it, so closing the
/// sheet shows the picture where it got to rather than where it was.
#[tauri::command]
pub fn playback_visible(state: State<AppState>, visible: bool) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.set_visible(visible))
}

/// Where the playhead is, and what the monitor has done since it started.
///
/// The page polls this rather than being pushed to. A frame is 33 ms and an
/// event per frame across the IPC boundary is exactly the traffic the native
/// monitor exists to remove; the page only needs the playhead often enough to
/// draw it, which is its own animation frame.
#[tauri::command]
pub fn playback_status(state: State<AppState>) -> Option<PlaybackStatus> {
    state
        .playback
        .lock()
        .unwrap()
        .as_ref()
        .map(|session| session.status())
}

fn with_session<F>(state: &State<AppState>, act: F) -> Option<PlaybackStatus>
where
    F: FnOnce(&Session),
{
    let running = state.playback.lock().unwrap();
    let session = running.as_ref()?;
    act(session);
    Some(session.status())
}

#[cfg(test)]
mod tests {
    use super::{process_tree_rss_bytes, Settings};

    #[test]
    fn existing_settings_delete_the_project_folder_by_default() {
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert!(settings.delete_project_folder);
    }

    #[test]
    fn memory_includes_descendants_but_not_neighbours() {
        let ps = "10 1 100\n11 10 20\n12 11 5\n20 1 900\n";
        assert_eq!(process_tree_rss_bytes(ps, 10), 125 * 1024);
    }
}
