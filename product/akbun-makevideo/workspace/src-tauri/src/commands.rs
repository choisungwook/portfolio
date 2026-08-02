//! The whole IPC surface.
//!
//! The page picks paths with native dialogs and hands them over; everything
//! that touches the file system or spawns a process happens here. That keeps
//! capabilities/default.json short, because the webview never needs a file
//! system scope of its own.

use makevideo_compositor::{Backend, Compositor};
use makevideo_render::accel::{self, Acceleration};
use makevideo_render::{ffmpeg, probe, tools, workspace, Asset, AssetKind, Project};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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
    pub default_fps: u32,
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
            default_fps: 30,
            workspace_dir: String::new(),
            ffmpeg_dir: String::new(),
            render_acceleration: "auto".into(),
            compositor: "auto".into(),
        }
    }
}

pub struct AppState {
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

fn find_tool(name: &str, configured: &str) -> Option<String> {
    tools::candidate_paths(name, configured)
        .into_iter()
        .find(|candidate| !candidate.contains('/') || Path::new(candidate).is_file())
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
fn chosen_acceleration(state: &State<AppState>) -> Option<Acceleration> {
    let settings = state.settings.lock().unwrap().clone();
    if settings.render_acceleration == "cpu" {
        return None;
    }
    let program = find_tool("ffmpeg", &settings.ffmpeg_dir);
    acceleration(state, program.as_ref()).available
}

/// Where project folders live. The setting wins; otherwise it is the Documents
/// folder, or the home folder on a system that has no Documents.
fn workspace_root(app: &AppHandle, settings: &Settings) -> PathBuf {
    let configured = settings.workspace_dir.trim();
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

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<AppState>) -> Bootstrap {
    let settings = state.settings.lock().unwrap().clone();
    let ffmpeg = find_tool("ffmpeg", &settings.ffmpeg_dir);
    Bootstrap {
        version: app.package_info().version.to_string(),
        data_dir: crate::store::data_dir(&app),
        workspace: workspace_root(&app, &settings)
            .to_string_lossy()
            .to_string(),
        acceleration: acceleration(&state, ffmpeg.as_ref()),
        compositor: compositor_info(&state, &settings.compositor),
        ffprobe: find_tool("ffprobe", &settings.ffmpeg_dir),
        ffmpeg,
        settings,
    }
}

/// One composited frame for the preview, drawn by the same shader the render
/// uses. Returns eight bytes of width and height then RGBA rows, which the page
/// blits straight onto a canvas.
///
/// Raw rather than an encoded image on purpose: the whole point is to show
/// exactly what the render will contain, and a lossy re-encode on the way to
/// the screen would undo that.
#[tauri::command]
pub fn preview_frame(
    state: State<AppState>,
    project: Project,
    time_ms: u64,
    max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    let settings = state.settings.lock().unwrap().clone();
    let gpu = compositor(&state, wanted_backend(&settings.compositor));
    let configured = settings.ffmpeg_dir.clone();
    let ffmpeg_path = find_tool("ffmpeg", &configured)
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
        time_ms,
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
    let ffprobe = find_tool("ffprobe", &configured);
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

#[tauri::command]
pub fn open_project(app: AppHandle, path: String) -> Result<Project, String> {
    let text =
        std::fs::read_to_string(&path).map_err(|error| format!("cannot open {path}: {error}"))?;
    let project: Project =
        serde_json::from_str(&text).map_err(|error| format!("{path} is not a project: {error}"))?;
    // The scope grant is in memory only, so a project opened in a new run has
    // to grant its media again or every preview is blank.
    for asset in &project.assets {
        allow_asset_file(&app, &asset.path);
    }
    Ok(project)
}

/// Writes the project file and nothing else. In particular it does not copy a
/// single frame of media: the file holds absolute paths to whatever the user
/// imported, wherever that lives. See wiki/architecture/workspace-and-files.md.
#[tauri::command]
pub fn save_project(path: String, project: Project) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&project).map_err(|error| error.to_string())?;
    // A project folder deleted from Finder between two saves should not lose
    // the edit that is in memory right now.
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {parent:?}: {error}"))?;
    }
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path}: {error}"))
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
    project: Project,
    preset: String,
) -> Result<(), String> {
    if state.render.lock().unwrap().is_some() {
        return Err("a render is already running".into());
    }
    let preset = ffmpeg::Preset::parse(&preset)?;
    let total_ms = project.duration_ms();
    let settings = state.settings.lock().unwrap().clone();
    let program = find_tool("ffmpeg", &settings.ffmpeg_dir).ok_or_else(|| {
        "ffmpeg was not found. Install it with `brew install ffmpeg`, or point Settings at the \
         folder that holds it."
            .to_string()
    })?;

    let chosen = chosen_acceleration(&state);
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
