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

/// Application settings, as opposed to the project settings that live in the
/// project file. These follow the user, not the edit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "system", "light" or "dark".
    pub theme: String,
    /// "full", "half" or "quarter". Quarter by default: it leaves decoding
    /// headroom when proxy generation and a multi-track preview overlap.
    pub preview_quality: String,
    /// Drop preview audio while the playhead is being dragged. Scrubbing with
    /// audio on means a seek per frame, which is what actually stalls playback.
    pub preview_mute_while_scrubbing: bool,
    /// Snap clips to nearby edges. Mirrors the magnet button in the timeline.
    pub snap: bool,
    /// Editor-only overlays. These follow the app, not the project or render.
    pub show_action_safe_area: bool,
    pub show_title_safe_area: bool,
    pub show_rule_of_thirds: bool,
    pub show_center_lines: bool,
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
    /// Whether the graphics device or CPU composites: "gpu" or "cpu". Both
    /// play through the persistent native monitor; CPU frames use a small GPU
    /// presenter only for the final upload.
    ///
    /// | | exact frame | playback | render |
    /// | --- | --- | --- | --- |
    /// | gpu | the compositor | native monitor | the compositor, filter graph if it fails |
    /// | cpu | software compositor | native monitor | the filter graph |
    ///
    /// ffmpeg is needed either way: it decodes for both and encodes for both.
    /// What changes is who puts the layers on top of each other.
    ///
    /// Only "cpu" means cpu. The old "auto" and "ffmpeg" values, and anything
    /// else a settings file holds, are the graphics device — a machine with no
    /// device quietly draws with the software compositor rather than refusing.
    pub compositor: String,
    /// Which graphics adapter to draw on, by the name `graphics_devices`
    /// reports. Empty is whatever wgpu picks. A live change to a missing named
    /// adapter is rejected and the active path and saved setting are kept.
    pub gpu_device: String,
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
            preview_quality: "quarter".into(),
            preview_mute_while_scrubbing: true,
            snap: true,
            show_action_safe_area: false,
            show_title_safe_area: false,
            show_rule_of_thirds: false,
            show_center_lines: false,
            default_width: 1920,
            default_height: 1080,
            default_rate: Rate::fps(30),
            workspace_dir: String::new(),
            ffmpeg_dir: String::new(),
            render_acceleration: "auto".into(),
            compositor: "gpu".into(),
            gpu_device: String::new(),
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

#[derive(Default)]
pub struct PlaybackSettingsGate {
    state: Mutex<PlaybackGateState>,
    idle: Condvar,
}

#[derive(Default)]
struct PlaybackGateState {
    settings: usize,
    attaching: bool,
}

#[derive(Clone, Copy)]
enum PlaybackLease {
    Settings,
    Attach,
}

impl PlaybackSettingsGate {
    fn enter(&self) -> PlaybackSettingsGuard<'_> {
        let mut state = self.state.lock().unwrap();
        while state.attaching {
            state = self.idle.wait(state).unwrap();
        }
        state.settings += 1;
        PlaybackSettingsGuard {
            gate: self,
            lease: PlaybackLease::Settings,
        }
    }

    fn enter_attach(&self) -> PlaybackSettingsGuard<'_> {
        let mut state = self.state.lock().unwrap();
        while state.settings != 0 || state.attaching {
            state = self.idle.wait(state).unwrap();
        }
        state.attaching = true;
        PlaybackSettingsGuard {
            gate: self,
            lease: PlaybackLease::Attach,
        }
    }

    fn wait(&self) {
        let mut state = self.state.lock().unwrap();
        while state.settings != 0 || state.attaching {
            state = self.idle.wait(state).unwrap();
        }
    }
}

struct PlaybackSettingsGuard<'a> {
    gate: &'a PlaybackSettingsGate,
    lease: PlaybackLease,
}

impl Drop for PlaybackSettingsGuard<'_> {
    fn drop(&mut self) {
        let mut state = self.gate.state.lock().unwrap();
        match self.lease {
            PlaybackLease::Settings => state.settings -= 1,
            PlaybackLease::Attach => state.attaching = false,
        }
        self.gate.idle.notify_all();
    }
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

/// CPU and GPU composition both use the persistent native monitor. The CPU
/// path uploads one finished RGBA layer through a presentation-only GPU; media
/// elements are only the startup fallback when no native presenter exists.
fn wanted_engine(_settings: &Settings) -> &'static str {
    "native"
}

/// Whether the setting asks to stay off the graphics device.
///
/// One test, used everywhere the choice matters, so the three things the
/// setting decides cannot drift apart. Only "cpu" is cpu; "gpu", the "auto" and
/// "ffmpeg" older settings files hold, and anything unrecognised all mean the
/// graphics device.
fn stays_on_cpu(settings: &Settings) -> bool {
    settings.compositor == "cpu"
}

/// Which backend a setting asks for. Auto rather than Gpu on purpose: a machine
/// with no device should quietly use the software path, not refuse to draw.
fn wanted_backend(setting: &str) -> Backend {
    if setting == "cpu" {
        Backend::Cpu
    } else {
        Backend::Auto
    }
}

fn explicit_playback_backend(settings: &Settings) -> Backend {
    if stays_on_cpu(settings) {
        Backend::Cpu
    } else {
        Backend::Gpu
    }
}

fn automatic_playback_backend(settings: &Settings) -> Backend {
    wanted_backend(&settings.compositor)
}

/// The adapter name a setting asks for, or `None` for whatever wgpu picks.
fn wanted_device(setting: &str) -> Option<&str> {
    let name = setting.trim();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// The compositor for a backend, made once and shared. This never fails: with
/// no graphics device the software compositor draws the same picture, only
/// slower, so "no GPU" stopped being a reason to give up.
fn compositor(state: &State<AppState>, backend: Backend, device: Option<&str>) -> Arc<Compositor> {
    let key = (backend, device.unwrap_or_default().to_string());
    let mut made = state.compositor.lock().unwrap();
    if let Some((_, existing)) = made.iter().find(|(kind, _)| *kind == key) {
        return Arc::clone(existing);
    }
    if let Some(existing) = made
        .iter()
        .find(|(cached, existing)| {
            lenient_cache_matches(
                backend,
                device,
                cached,
                existing.is_gpu(),
                existing.adapter(),
            )
        })
        .map(|(_, existing)| Arc::clone(existing))
    {
        made.push((key, Arc::clone(&existing)));
        return existing;
    }
    let built =
        Arc::new(Compositor::with_device(backend, device).unwrap_or_else(|_| Compositor::new()));
    made.push((key, Arc::clone(&built)));
    built
}

/// A playback compositor that honours an explicit choice. Unlike the general
/// preview/render helper above, a named GPU that is absent is an error: a live
/// reconfiguration must roll back instead of silently moving to another card.
fn strict_compositor(
    state: &State<AppState>,
    backend: Backend,
    device: Option<&str>,
) -> Result<Arc<Compositor>, String> {
    let mut made = state.compositor.lock().unwrap();
    // Cache keys describe what originally requested a compositor, not what
    // adapter it actually opened. Reuse an Auto compositor that already owns
    // the requested GPU so a no-op explicit choice stays the same Arc and the
    // native surface keeps its zero-copy path.
    if let Some(existing) = made
        .iter()
        .find(|(cached, existing)| {
            strict_cache_matches(
                backend,
                device,
                cached,
                existing.is_gpu(),
                existing.adapter(),
            )
        })
        .map(|(_, existing)| Arc::clone(existing))
    {
        validate_strict_compositor(backend, device, &existing)?;
        let key = (backend, device.unwrap_or_default().to_string());
        if !made.iter().any(|(cached, _)| *cached == key) {
            made.push((key, Arc::clone(&existing)));
        }
        return Ok(existing);
    }
    let built = Arc::new(Compositor::with_device(backend, device)?);
    validate_strict_compositor(backend, device, &built)?;
    let key = (backend, device.unwrap_or_default().to_string());
    made.push((key, Arc::clone(&built)));
    Ok(built)
}

fn lenient_cache_matches(
    backend: Backend,
    device: Option<&str>,
    cached: &(Backend, String),
    is_gpu: bool,
    adapter: &str,
) -> bool {
    match (backend, device) {
        (Backend::Auto, Some(name)) => is_gpu && adapter == name,
        (Backend::Auto, None) => is_gpu && cached.1.is_empty() && cached.0 == Backend::Gpu,
        (Backend::Gpu, Some(name)) => is_gpu && adapter == name,
        (Backend::Gpu, None) => is_gpu && cached.1.is_empty(),
        (Backend::Cpu, None) => !is_gpu,
        (Backend::Cpu, Some(_)) => false,
    }
}

fn strict_cache_matches(
    backend: Backend,
    device: Option<&str>,
    cached: &(Backend, String),
    is_gpu: bool,
    adapter: &str,
) -> bool {
    match (backend, device) {
        (Backend::Gpu, Some(name)) => is_gpu && adapter == name,
        (Backend::Gpu, None) => is_gpu && cached.1.is_empty(),
        (Backend::Cpu, None) => !is_gpu,
        _ => false,
    }
}

fn validate_strict_compositor(
    backend: Backend,
    device: Option<&str>,
    compositor: &Compositor,
) -> Result<(), String> {
    if backend == Backend::Gpu && !compositor.is_gpu() {
        return Err("the requested graphics compositor is not available".into());
    }
    if backend == Backend::Cpu && compositor.is_gpu() {
        return Err("the requested CPU compositor is not available".into());
    }
    if let Some(name) = device {
        if name != compositor.adapter() {
            return Err(format!(
                "graphics device `{name}` is not available; the current setting was kept"
            ));
        }
    }
    Ok(())
}

/// The compositor the settings ask for.
fn settings_compositor(state: &State<AppState>, settings: &Settings) -> Arc<Compositor> {
    compositor(
        state,
        wanted_backend(&settings.compositor),
        wanted_device(&settings.gpu_device),
    )
}

/// Every graphics adapter this machine offers, for the settings list.
///
/// Asked for by the page rather than sent with the bootstrap: enumerating
/// adapters opens the graphics stack, and an app that never draws on a GPU
/// should not do that on the way up.
#[tauri::command]
pub fn graphics_devices() -> Vec<makevideo_compositor::gpu::Device> {
    makevideo_compositor::gpu::devices()
}

fn compositor_info(state: &State<AppState>, settings: &Settings) -> CompositorInfo {
    // Normalised, so the page never has to know that a settings file may still
    // hold "auto" or "ffmpeg".
    let setting = if stays_on_cpu(settings) { "cpu" } else { "gpu" }.to_string();
    let backend = wanted_backend(&settings.compositor);
    let made = settings_compositor(state, settings);
    // A name that is not on this machine is drawn on the automatic pick, and
    // the note has to say so rather than repeat the setting back.
    let asked_for = wanted_device(&settings.gpu_device);
    CompositorInfo {
        setting,
        device: made.adapter().to_string(),
        gpu: made.is_gpu(),
        fell_back: (backend == Backend::Auto && !made.is_gpu())
            || asked_for.is_some_and(|name| name != made.adapter()),
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
#[tauri::command]
pub fn list_fonts() -> Vec<String> {
    makevideo_compositor::text::font_families()
}

#[tauri::command]
pub fn validate_lut(path: String) -> Result<(), String> {
    makevideo_compositor::lut::Lut::from_cube_file(&path).map(|_| ())
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

enum PlaybackRollback {
    None,
    Video,
    Guides(Guides),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlaybackChange {
    None,
    Video,
    Guides,
}

fn playback_change(
    before: &Settings,
    after: &Settings,
    has_unconfirmed_settings: bool,
) -> PlaybackChange {
    if has_unconfirmed_settings || playback_video_settings_changed(before, after) {
        PlaybackChange::Video
    } else if playback_guides_changed(before, after) {
        PlaybackChange::Guides
    } else {
        PlaybackChange::None
    }
}

fn restore_confirmed_playback(
    latest: &AtomicU64,
    generation: u64,
    session: Option<&Arc<Session>>,
    rollback: &PlaybackRollback,
) -> Option<String> {
    match (session, rollback) {
        (Some(session), PlaybackRollback::Video) => {
            restore_if_current(latest, generation, || {
                // Read at rollback time. An automatic proxy refresh may have
                // updated the confirmed paths while this settings candidate
                // was building, and the unpersisted candidate never changes
                // the confirmed snapshot.
                session.reconfigure(generation, session.confirmed_config())?;
                session.confirm_settings_generation(generation);
                Ok(())
            })
        }
        (Some(session), PlaybackRollback::Guides(guides)) => {
            restore_if_current(latest, generation, || {
                session.set_guides(generation, *guides)?;
                session.confirm_settings_generation(generation);
                Ok(())
            })
        }
        _ => None,
    }
}

fn restore_if_current(
    latest: &AtomicU64,
    generation: u64,
    restore: impl FnOnce() -> Result<(), String>,
) -> Option<String> {
    if latest.load(Ordering::Relaxed) != generation {
        return None;
    }
    match restore() {
        Ok(()) => None,
        Err(_) if latest.load(Ordering::Relaxed) != generation => None,
        Err(reason) => Some(reason),
    }
}

fn playback_settings_error(error: String, rollback_error: Option<String>) -> String {
    match rollback_error {
        Some(reason) => format!(
            "{error}; the saved setting was kept, but restoring playback also failed: {reason}"
        ),
        None => error,
    }
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Bootstrap, String> {
    let _playback_settings = state.playback_settings.enter();
    let session = playback_session(&state);
    let generation = {
        let _commit = state.settings_transaction.lock().unwrap();
        let generation = state.settings_generation.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some(session) = session.as_ref() {
            session.reserve_settings_generation(generation);
        }
        generation
    };
    let before = state.settings.lock().unwrap().clone();
    let change = if let Some(session) = session.as_ref() {
        playback_change(&before, &settings, session.has_unconfirmed_settings())
    } else {
        PlaybackChange::None
    };
    let rollback = match (session.as_ref(), change) {
        (Some(_), PlaybackChange::Video) => PlaybackRollback::Video,
        (Some(session), PlaybackChange::Guides) => {
            PlaybackRollback::Guides(session.confirmed_config().guides)
        }
        _ => PlaybackRollback::None,
    };

    if let Err(error) = crate::store::prepare_log_dir(&app, &settings) {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }

    let apply = if let Some(session) = session.as_ref() {
        if change == PlaybackChange::Video {
            let graphics_changed = before.compositor != settings.compositor
                || before.gpu_device != settings.gpu_device;
            let new_config = if graphics_changed {
                explicit_playback_config(&app, &state, &settings)
            } else {
                automatic_playback_config(&app, &state, &settings)
            };
            new_config.and_then(|config| session.reconfigure(generation, config).map(|_| ()))
        } else if change == PlaybackChange::Guides {
            session
                .set_guides(generation, playback_guides(&settings))
                .map(|_| ())
        } else {
            Ok(())
        }
    } else {
        Ok(())
    };
    if let Err(error) = apply {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }

    if state.settings_generation.load(Ordering::Relaxed) != generation {
        return Err("a newer settings change superseded this one".into());
    }
    let transaction = state.settings_transaction.lock().unwrap();
    if state.settings_generation.load(Ordering::Relaxed) != generation {
        return Err("a newer settings change superseded this one".into());
    }
    if let Err(error) = crate::store::save_settings(&app, &settings) {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }
    if change != PlaybackChange::None {
        let session = session
            .as_ref()
            .expect("a playback change only exists with an active session");
        session.confirm_settings_generation(generation);
    }

    apply_theme(&app, &settings.theme);
    {
        let mut current = state.settings.lock().unwrap();
        // Pointing at a different ffmpeg means a different set of encoders, so
        // the cached answer is about the wrong binary.
        if current.ffmpeg_dir != settings.ffmpeg_dir {
            *state.accel.lock().unwrap() = None;
        }
        *current = settings;
    }
    let response = bootstrap(app, state.clone());
    drop(transaction);
    Ok(response)
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

fn probe_proxy_source(ffprobe: &str, path: &str) -> makevideo_proxy::SourceProbe {
    let Ok(output) = Command::new(ffprobe)
        .args(makevideo_proxy::probe_args(path))
        .output()
    else {
        return makevideo_proxy::SourceProbe::default();
    };
    makevideo_proxy::parse_probe(&String::from_utf8_lossy(&output.stdout))
}

const PROXY_PROBE_CONCURRENCY: usize = 4;

async fn assess_proxy_assets(
    ffprobe_path: String,
    assets: Vec<Asset>,
) -> Result<Vec<(Asset, makevideo_proxy::Assessment)>, String> {
    let mut assessed = Vec::with_capacity(assets.len());
    for batch in assets.chunks(PROXY_PROBE_CONCURRENCY) {
        let mut probes = Vec::with_capacity(batch.len());
        for asset in batch.iter().cloned() {
            let ffprobe_path = ffprobe_path.clone();
            probes.push(tauri::async_runtime::spawn_blocking(move || {
                let source = probe_proxy_source(&ffprobe_path, &asset.path);
                let assessment = makevideo_proxy::assess(&asset, &source);
                (asset, assessment)
            }));
        }
        for probe in probes {
            assessed.push(
                probe
                    .await
                    .map_err(|error| format!("the proxy inspection job did not finish: {error}"))?,
            );
        }
    }
    Ok(assessed)
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
    encoder: Option<&str>,
    reason: &str,
) -> Result<String, String> {
    let output = makevideo_proxy::media_path(project_path, &asset.id)?;
    let temporary = output.with_extension("part.mp4");
    let args = makevideo_proxy::ffmpeg_args(asset, &temporary, encoder);
    let mut child = Command::new(ffmpeg_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    let done = Arc::new(AtomicBool::new(false));
    let progress = Arc::new(AtomicU8::new(0));
    let monitor = monitor_proxy_playback(
        app.clone(),
        child.id(),
        Arc::clone(&done),
        Arc::clone(proxies),
        project_path.to_string(),
        asset.id.clone(),
        reason.to_string(),
        Arc::clone(&progress),
    );
    if let Some(stdout) = child.stdout.take() {
        let mut last_percent = 0;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(ffmpeg::Progress::Position(position_ms)) =
                ffmpeg::parse_progress_line(&line)
            {
                let percent = if asset.duration_ms > 0 {
                    ((position_ms.min(asset.duration_ms) * 100) / asset.duration_ms) as u8
                } else {
                    0
                };
                if !makevideo_proxy::progress_percent_changed(&mut last_percent, percent) {
                    continue;
                }
                progress.store(percent, Ordering::Relaxed);
                if !set_proxy_status(
                    app,
                    proxies,
                    project_path,
                    proxy_status_entry(&asset.id, "generating", percent, "", reason, ""),
                ) {
                    let _ = child.kill();
                    let _ = child.wait();
                    done.store(true, Ordering::Relaxed);
                    let _ = monitor.join();
                    return Err("the project changed".into());
                }
            }
        }
    }
    let status = child.wait();
    done.store(true, Ordering::Relaxed);
    let _ = monitor.join();
    let status = status.map_err(|error| error.to_string())?;
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

fn playback_is_running(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .playback
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|session| session.status().playing)
}

/// Jobs queued for proxying wait until playback stops. The waiting state is
/// emitted once so the page can explain why zero-percent work is not moving.
fn wait_for_playback_pause(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    asset_id: &str,
    reason: &str,
) -> Result<(), String> {
    let mut reported = false;
    loop {
        if !playback_is_running(app) {
            return Ok(());
        }
        if !reported {
            if !set_proxy_status(
                app,
                proxies,
                project_path,
                proxy_status_entry(
                    asset_id,
                    "waiting",
                    0,
                    "",
                    reason,
                    "playback is active; generation starts after playback stops",
                ),
            ) {
                return Err("the project changed".into());
            }
            reported = true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// An encoder that was already running is suspended while playback owns the
/// decode budget. Its state and last percentage stay visible until it resumes.
#[allow(clippy::too_many_arguments)]
fn monitor_proxy_playback(
    app: AppHandle,
    pid: u32,
    done: Arc<AtomicBool>,
    proxies: Arc<Mutex<ProxyState>>,
    project_path: String,
    asset_id: String,
    reason: String,
    progress: Arc<AtomicU8>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut proxy_paused = false;
        while !done.load(Ordering::Relaxed) {
            let should_pause_proxy = playback_is_running(&app);
            if should_pause_proxy != proxy_paused {
                let _ = set_proxy_process_paused(pid, should_pause_proxy);
                proxy_paused = should_pause_proxy;
                let state = if proxy_paused { "paused" } else { "generating" };
                let message = if proxy_paused {
                    "playback is active; generation resumes after playback stops"
                } else {
                    ""
                };
                let _ = set_proxy_status(
                    &app,
                    &proxies,
                    &project_path,
                    proxy_status_entry(
                        &asset_id,
                        state,
                        progress.load(Ordering::Relaxed),
                        "",
                        &reason,
                        message,
                    ),
                );
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if proxy_paused {
            let _ = set_proxy_process_paused(pid, false);
        }
    })
}

#[cfg(unix)]
fn set_proxy_process_paused(pid: u32, paused: bool) -> Result<(), String> {
    let signal = if paused { libc::SIGSTOP } else { libc::SIGCONT };
    let result = unsafe { libc::kill(pid as libc::pid_t, signal) };
    (result == 0)
        .then_some(())
        .ok_or_else(|| std::io::Error::last_os_error().to_string())
}

#[cfg(not(unix))]
fn set_proxy_process_paused(_: u32, _: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn proxy_status(state: State<AppState>) -> Vec<ProxyStatus> {
    proxy_statuses(&state.proxies.lock().unwrap())
}

#[tauri::command]
pub async fn start_proxies(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
) -> Result<Vec<ProxyStatus>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so proxies cannot be created")?;
    let ffprobe_path = find_tool(&app, "ffprobe", &configured)
        .ok_or("ffprobe was not found, so proxy media cannot be assessed")?;
    let acceleration = acceleration(&state, Some(&ffmpeg_path)).available;
    let project = state.document.lock().unwrap().project().clone();
    let video_assets = project
        .assets
        .iter()
        .filter(|asset| asset.kind == AssetKind::Video)
        .cloned()
        .collect::<Vec<_>>();
    {
        let mut proxies = state.proxies.lock().unwrap();
        if proxies.project_path != project_path {
            proxies.project_path = project_path.clone();
            proxies.entries.clear();
        }
        let video_asset_ids: HashSet<String> = video_assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect();
        proxies.entries.retain(|id, _| video_asset_ids.contains(id));
        for asset in &video_assets {
            proxies.entries.entry(asset.id.clone()).or_insert_with(|| {
                proxy_status_entry(
                    &asset.id,
                    "inspecting",
                    0,
                    "",
                    "checking resolution, codec, and keyframe interval",
                    "",
                )
            });
        }
    }
    emit_proxy_status(&app, &state.proxies);

    let assessed = assess_proxy_assets(ffprobe_path, video_assets).await?;
    let mut jobs = Vec::new();
    {
        let mut proxies = state.proxies.lock().unwrap();
        if proxies.project_path != project_path {
            return Ok(proxy_statuses(&proxies));
        }
        for (asset, assessment) in assessed {
            if matches!(
                proxies
                    .entries
                    .get(&asset.id)
                    .map(|status| status.state.as_str()),
                Some("queued" | "waiting" | "generating" | "paused")
            ) {
                continue;
            }
            if !assessment.needs_proxy {
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "original", 100, "", assessment.reason, ""),
                );
            } else if let Some(path) = makevideo_proxy::valid_proxy(&project_path, &asset) {
                allow_asset_file(&app, &path);
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "ready", 100, path, assessment.reason, ""),
                );
            } else {
                let reason = assessment.reason;
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "queued", 0, "", &reason, ""),
                );
                jobs.push((asset, reason));
            }
        }
    }
    emit_proxy_status(&app, &state.proxies);

    if !jobs.is_empty() {
        let proxies = Arc::clone(&state.proxies);
        let worker = std::thread::spawn(move || {
            if let Ok(dir) = makevideo_proxy::proxy_dir(&project_path) {
                if let Err(error) = std::fs::create_dir_all(&dir) {
                    for (asset, reason) in jobs {
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            proxy_status_entry(
                                asset.id,
                                "failed",
                                0,
                                "",
                                reason,
                                error.to_string(),
                            ),
                        );
                    }
                    return;
                }
            }
            for (asset, reason) in jobs {
                if let Err(message) =
                    wait_for_playback_pause(&app, &proxies, &project_path, &asset.id, &reason)
                {
                    if message == "the project changed" {
                        return;
                    }
                }
                if !set_proxy_status(
                    &app,
                    &proxies,
                    &project_path,
                    proxy_status_entry(&asset.id, "generating", 0, "", &reason, ""),
                ) {
                    return;
                }
                match make_proxy(
                    &app,
                    &proxies,
                    &project_path,
                    &ffmpeg_path,
                    &asset,
                    acceleration.as_ref().map(|item| item.encoder.as_str()),
                    &reason,
                ) {
                    Ok(path) => {
                        allow_asset_file(&app, &path);
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            proxy_status_entry(asset.id, "ready", 100, path, reason, ""),
                        );
                    }
                    Err(message) if message == "the project changed" => return,
                    Err(message) => {
                        set_proxy_status(
                            &app,
                            &proxies,
                            &project_path,
                            proxy_status_entry(asset.id, "failed", 0, "", reason, message),
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

fn srt_frame(value: &str, rate: Rate) -> Result<i64, String> {
    let parts: Vec<_> = value
        .trim()
        .replace(',', ".")
        .split(':')
        .map(str::to_string)
        .collect();
    if parts.len() != 3 {
        return Err(format!("invalid SRT time: {value}"));
    }
    let seconds: f64 = parts[0]
        .parse::<f64>()
        .map_err(|_| format!("invalid SRT time: {value}"))?
        * 3600.0
        + parts[1]
            .parse::<f64>()
            .map_err(|_| format!("invalid SRT time: {value}"))?
            * 60.0
        + parts[2]
            .parse::<f64>()
            .map_err(|_| format!("invalid SRT time: {value}"))?;
    Ok((seconds * rate.as_f64()).round().max(0.0) as i64)
}

fn srt_timestamp(frame: i64, rate: Rate) -> String {
    let millis = ((frame.max(0) as f64 / rate.as_f64()) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        millis / 3_600_000,
        (millis / 60_000) % 60,
        (millis / 1_000) % 60,
        millis % 1_000
    )
}

fn srt_cues(text: &str, rate: Rate) -> Result<Vec<(i64, i64, String)>, String> {
    let mut cues = Vec::new();
    for block in text.replace("\r\n", "\n").split("\n\n") {
        let lines: Vec<_> = block
            .lines()
            .filter(|line| !line.trim().is_empty())
            .collect();
        let Some(timing) = lines.iter().find(|line| line.contains(" --> ")) else {
            continue;
        };
        let Some((start, end)) = timing.split_once(" --> ") else {
            continue;
        };
        let start = srt_frame(start, rate)?;
        let end = srt_frame(end, rate)?;
        let text = lines
            .iter()
            .skip_while(|line| **line != *timing)
            .skip(1)
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        if end > start && !text.is_empty() {
            cues.push((start, end, text));
        }
    }
    Ok(cues)
}

fn srt_contents(mut cues: Vec<(i64, i64, &str)>, rate: Rate) -> String {
    cues.sort_by_key(|(start, _, _)| *start);
    cues.into_iter()
        .enumerate()
        .map(|(index, (start, end, text))| {
            format!(
                "{}\n{} --> {}\n{}\n\n",
                index + 1,
                srt_timestamp(start, rate),
                srt_timestamp(end, rate),
                text
            )
        })
        .collect()
}

#[tauri::command]
pub fn import_srt(
    state: State<AppState>,
    track_id: String,
    path: String,
) -> Result<DocumentState, String> {
    let text =
        std::fs::read_to_string(&path).map_err(|error| format!("cannot read {path}: {error}"))?;
    let mut document = state.document.lock().unwrap();
    let rate = document.project().rate();
    let track = document
        .project()
        .track(&track_id)
        .ok_or("subtitle track is not on the timeline")?;
    if track.kind != TrackKind::Subtitle {
        return Err("choose a subtitle track before importing SRT".into());
    }
    let mut commands = Vec::new();
    for (start, end, text) in srt_cues(&text, rate)? {
        commands.push(Edit::AddVisualItem {
            track_id: track_id.clone(),
            content: VisualContent::Text {
                text,
                style: TextStyle::default(),
            },
            start,
            duration: end - start,
            transform: VisualTransform {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
                rotation: 0.0,
                opacity: 1.0,
            },
            z_index: 0,
            id: None,
        });
    }
    document.apply_all(commands)?;
    Ok(document.state())
}

#[tauri::command]
pub fn export_srt(state: State<AppState>, track_id: String, path: String) -> Result<(), String> {
    let document = state.document.lock().unwrap();
    let track = document
        .project()
        .track(&track_id)
        .ok_or("subtitle track is not on the timeline")?;
    if track.kind != TrackKind::Subtitle {
        return Err("choose a subtitle track before exporting SRT".into());
    }
    let cues = track
        .visual_items
        .iter()
        .filter_map(|item| {
            let VisualContent::Text { text, .. } = &item.content else {
                return None;
            };
            Some((item.start, item.end_frame(), text.as_str()))
        })
        .collect();
    let output = srt_contents(cues, document.project().rate());
    std::fs::write(&path, output).map_err(|error| format!("cannot write {path}: {error}"))
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
    let mut project: Project =
        serde_json::from_str(&text).map_err(|error| format!("{path} is not a project: {error}"))?;
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffprobe = find_tool(&app, "ffprobe", &configured);
    if ffprobe.is_some() {
        for asset in &mut project.assets {
            let measured = probe_asset(ffprobe.as_ref(), &asset.path);
            if measured.width > 0 && measured.height > 0 {
                asset.width = measured.width;
                asset.height = measured.height;
            }
            if measured.duration_ms > 0 {
                asset.duration_ms = measured.duration_ms;
            }
            asset.has_audio = measured.has_audio;
        }
    }
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
/// The rasterized text and shape stills for one render. The directory lives
/// exactly as long as this value: dropping it — after the last route, or on
/// the error path before any — removes the files.
struct VisualStills {
    dir: PathBuf,
    inputs: Vec<ffmpeg::VisualInput>,
}

impl Drop for VisualStills {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Rasterize every text and shape item at the output size and write each as a
/// PAM still for the filter graph to overlay. None when the project has no
/// visual items, which is also no temp directory.
fn write_visual_stills(
    project: &Project,
    preset: ffmpeg::Preset,
) -> Result<Option<VisualStills>, String> {
    let (width, height) = ffmpeg::output_size(&project.settings, preset);
    let rasters = makevideo_compositor::text::item_rasters(project, width, height);
    if rasters.is_empty() {
        return Ok(None);
    }
    // A counter beside the pid, because two renders from one app run must not
    // share a directory the first one deletes.
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "akbun-makevideo-visuals-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot prepare the text and shape overlays: {error}"))?;
    // Built before the writes, so a failed write still removes the directory.
    let mut stills = VisualStills {
        dir,
        inputs: Vec::new(),
    };
    for (index, raster) in rasters.iter().enumerate() {
        let path = stills.dir.join(format!("visual-{index}.pam"));
        makevideo_compositor::text::write_pam(&path, &raster.pixels, raster.width, raster.height)
            .map_err(|error| format!("cannot write a text and shape overlay: {error}"))?;
        stills.inputs.push(ffmpeg::VisualInput {
            path: path.to_string_lossy().into_owned(),
            x: raster.x,
            y: raster.y,
            opacity: raster.opacity,
            start_frame: raster.start_frame,
            end_frame: raster.end_frame,
        });
    }
    Ok(Some(stills))
}

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
    let dynamic_paint = project.uses_video_paint();
    // On the CPU setting the filter graph normally draws, because putting a
    // whole render through the software compositor is much slower. A video
    // paint is different: it changes every frame, so it must use that
    // compositor instead of turning one raster into a frozen overlay still.
    let gpu = if stays_on_cpu(&settings) {
        if dynamic_paint {
            Some(strict_compositor(&state, Backend::Cpu, None)?)
        } else {
            None
        }
    } else {
        Some(settings_compositor(&state, &settings))
    };

    // The graph routes cannot draw text, so each visual item is rasterized
    // once — the same pixels the compositor composites — and handed to the
    // graph as an overlay input. Written even when the composited route goes
    // first: the fallback runs after a failure, which is the wrong moment to
    // start writing files.
    makevideo_compositor::text::set_ffmpeg_path(&program);
    let visual_dir = if dynamic_paint {
        None
    } else {
        write_visual_stills(&project, preset)?
    };
    let visuals = visual_dir
        .as_ref()
        .map(|prepared| prepared.inputs.clone())
        .unwrap_or_default();

    let mut routes: Vec<Route> = Vec::new();
    let built = (|| -> Result<(), String> {
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
                args: ffmpeg::build_args(&project, &path, preset, Some(hardware), &visuals)?,
            });
        }
        // A filter graph only accepts static visual rasters. Do not turn a
        // failed dynamic render into a successful export with frozen paint.
        if !dynamic_paint {
            let plain = ffmpeg::build_args(&project, &path, preset, None, &visuals)?;
            routes.push(Route::Graph {
                label: "ffmpeg filter graph, CPU encoder".into(),
                args: plain,
            });
        }
        Ok(())
    })();
    if let Err(error) = built {
        drop(visual_dir);
        return Err(error);
    }

    state.cancelled.store(false, Ordering::SeqCst);
    let shared = Arc::clone(&state.render);
    let cancelled = Arc::clone(&state.cancelled);
    let document = Arc::clone(&state.document);

    std::thread::spawn(move || {
        // Holds the overlay stills on disk until the last route has run; the
        // fallback route reads them minutes after the render started.
        let _visual_dir = visual_dir;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub memory_bytes: u64,
    pub cpu_percent: f64,
}

fn process_metrics_rows(output: &str) -> Result<Vec<(u32, u32, u64, f64)>, String> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let mut fields = line.split_whitespace();
            let pid = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let parent = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let rss_kib = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            let cpu_percent = fields
                .next()
                .ok_or_else(|| format!("cannot parse process metrics row: {line:?}"))?
                .parse()
                .map_err(|error| format!("cannot parse process metrics row {line:?}: {error}"))?;
            if fields.next().is_some() {
                return Err(format!("cannot parse process metrics row: {line:?}"));
            }
            Ok((pid, parent, rss_kib, cpu_percent))
        })
        .collect()
}

/// Process-tree metrics include WebView and ffmpeg children, which hold most
/// preview memory and CPU outside the Rust process itself.
#[tauri::command]
pub fn process_metrics() -> Result<ProcessMetrics, String> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,ppid=,rss=,pcpu="])
        .output()
        .map_err(|error| format!("cannot read process metrics: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let rows = process_metrics_rows(&String::from_utf8_lossy(&output.stdout))?;
    let root = std::process::id();
    if !rows.iter().any(|(pid, _, _, _)| *pid == root) {
        return Err(format!(
            "cannot find current process {root} in process metrics"
        ));
    }
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut values = HashMap::new();
    for (pid, parent, rss_kib, cpu_percent) in rows {
        children.entry(parent).or_default().push(pid);
        values.insert(pid, (rss_kib, cpu_percent));
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
    let (rss_kib, cpu_percent) = found.into_iter().fold((0, 0.0), |total, pid| {
        let Some((rss, cpu)) = values.get(&pid) else {
            return total;
        };
        (total.0 + rss, total.1 + cpu)
    });
    Ok(ProcessMetrics {
        memory_bytes: rss_kib.saturating_mul(1024),
        cpu_percent,
    })
}

#[tauri::command]
pub fn read_error_log(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let settings = state.settings.lock().unwrap().clone();
    crate::store::recent_error_log(&app, &settings, 200)
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
    place: MonitorPlace,
    frame: i64,
) -> PlaybackChoice {
    let _attach = state.playback_settings.enter_attach();
    let attach_epoch = state.playback_epoch.load(Ordering::SeqCst);
    let settings = state.settings.lock().unwrap().clone();
    // Already running: place it and hand back what it is doing. The page asks
    // again on every layout change, and tearing the session down to build the
    // same one would restart the decoders every time somebody dragged a panel.
    if let Some(session) = playback_session(&state) {
        session.place(place);
        return PlaybackChoice::from(Choice::native(), Some(session.status()));
    }

    // The setting is read before anything is built. Starting a session and
    // then throwing it away because the setting said media elements would put a
    // native view on screen for as long as it took to notice, which is a flash
    // of the wrong picture over the stage.
    let wanted = wanted_engine(&settings);
    if makevideo_present::Engine::parse(wanted) == makevideo_present::Engine::MediaElement {
        return PlaybackChoice::from(choose(wanted, Ok(())), None);
    }

    let session = match start_session(&window, &state, &settings, place, frame) {
        Ok(session) => Arc::new(session),
        Err(reason) => {
            if let Some(existing) = playback_session(&state) {
                return PlaybackChoice::from(Choice::native(), Some(existing.status()));
            }
            return PlaybackChoice::from(choose(wanted, Err(reason)), None);
        }
    };
    match store_if_current(
        &state.playback,
        &state.playback_epoch,
        attach_epoch,
        Arc::clone(&session),
    ) {
        Ok(()) => PlaybackChoice::from(Choice::native(), Some(session.status())),
        Err(rejected) => {
            rejected.stop();
            if state.playback_epoch.load(Ordering::SeqCst) == attach_epoch {
                if let Some(existing) = playback_session(&state) {
                    return PlaybackChoice::from(Choice::native(), Some(existing.status()));
                }
            }
            PlaybackChoice::from(
                Choice::fallback("playback attach was cancelled before it became active"),
                None,
            )
        }
    }
}

fn start_session(
    window: &tauri::WebviewWindow,
    state: &State<AppState>,
    settings: &Settings,
    place: MonitorPlace,
    frame: i64,
) -> Result<Session, String> {
    if !place.is_visible() {
        return Err("the monitor has no room on screen yet".into());
    }
    let config = automatic_playback_config(&window.app_handle(), state, settings)?;
    Session::start(
        window,
        Arc::clone(&state.document),
        config,
        place,
        frame.max(0),
    )
}

fn explicit_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
) -> Result<PlaybackConfig, String> {
    let backend = explicit_playback_backend(settings);
    let device = if backend == Backend::Gpu {
        wanted_device(&settings.gpu_device)
    } else {
        None
    };
    let compositor = strict_compositor(state, backend, device)?;
    let presenter = if compositor.is_gpu() {
        Arc::clone(&compositor)
    } else {
        strict_compositor(state, Backend::Gpu, None)?
    };
    build_playback_config(app, state, settings, compositor, presenter)
}

fn automatic_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
) -> Result<PlaybackConfig, String> {
    let compositor = compositor(
        state,
        automatic_playback_backend(settings),
        wanted_device(&settings.gpu_device),
    );
    let presenter = if compositor.is_gpu() {
        Arc::clone(&compositor)
    } else {
        strict_compositor(state, Backend::Gpu, None)?
    };
    build_playback_config(app, state, settings, compositor, presenter)
}

fn build_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
    compositor: Arc<Compositor>,
    presenter: Arc<Compositor>,
) -> Result<PlaybackConfig, String> {
    let project = state.document.lock().unwrap().project().clone();
    let ffmpeg = find_tool(app, "ffmpeg", &settings.ffmpeg_dir)
        .ok_or("ffmpeg was not found, so nothing can be decoded")?;
    let proxy_paths = if settings.proxy_enabled {
        ready_proxy_paths(&state.proxies.lock().unwrap())
    } else {
        HashMap::new()
    };
    let current_ffmpeg_dir = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let probe = if current_ffmpeg_dir == settings.ffmpeg_dir {
        acceleration(state, Some(&ffmpeg))
    } else {
        detect_acceleration(&ffmpeg)
    };
    let hwaccel = probe.available.and_then(|candidate| candidate.hwaccel);
    let (preview_width, preview_height) = native_preview_dimensions(
        project.settings.width,
        project.settings.height,
        &settings.preview_quality,
    );
    let config = PlaybackConfig::new(compositor, ffmpeg, preview_width, preview_height)
        .with_presenter(presenter)
        .with_hwaccel(hwaccel)
        .with_guides(playback_guides(settings));
    Ok(if settings.proxy_enabled {
        config.with_proxies(proxy_paths)
    } else {
        config
    })
}

fn playback_video_settings_changed(before: &Settings, after: &Settings) -> bool {
    before.preview_quality != after.preview_quality
        || before.compositor != after.compositor
        || before.gpu_device != after.gpu_device
        || before.proxy_enabled != after.proxy_enabled
        || before.ffmpeg_dir != after.ffmpeg_dir
}

fn playback_guides_changed(before: &Settings, after: &Settings) -> bool {
    before.show_action_safe_area != after.show_action_safe_area
        || before.show_title_safe_area != after.show_title_safe_area
        || before.show_rule_of_thirds != after.show_rule_of_thirds
        || before.show_center_lines != after.show_center_lines
}

fn playback_guides(settings: &Settings) -> Guides {
    Guides {
        action_safe_area: settings.show_action_safe_area,
        title_safe_area: settings.show_title_safe_area,
        rule_of_thirds: settings.show_rule_of_thirds,
        center_lines: settings.show_center_lines,
    }
}

fn native_preview_dimensions(width: u32, height: u32, quality: &str) -> (u32, u32) {
    let divisor = match quality {
        "full" => 1,
        "half" => 2,
        _ => 4,
    };
    let scaled = |value: u32| {
        let value = (value / divisor).max(2);
        value - value % 2
    };
    (scaled(width), scaled(height))
}

/// Stop the native monitor and take its view down. The page falls back to its
/// own preview until it attaches again.
#[tauri::command]
pub fn playback_release(state: State<AppState>) {
    // Dropped outside the lock: taking the session down joins its thread, and
    // holding the lock through that would block every other command.
    state.playback_epoch.fetch_add(1, Ordering::SeqCst);
    let session = state.playback.lock().unwrap().take();
    if let Some(session) = session.as_ref() {
        session.stop();
    }
    drop(session);
}

/// Refresh ready proxy paths without releasing the native session. The same
/// first-present transaction used by settings changes keeps audio and the old
/// video path live until the refreshed path is visible.
#[tauri::command]
pub fn playback_refresh(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    loop {
        state.playback_settings.wait();
        let Some(session) = playback_session(&state) else {
            return Ok(None);
        };
        let proxy_paths = ready_proxy_paths(&state.proxies.lock().unwrap());
        match session.refresh_proxies(proxy_paths) {
            Ok(status) => return Ok(Some(status)),
            Err(reason) if proxy_refresh_should_retry(&reason) => continue,
            Err(reason) => return Err(reason),
        }
    }
}

fn proxy_refresh_should_retry(reason: &str) -> bool {
    reason == EXPLICIT_RECONFIGURE_PENDING
}

#[tauri::command]
pub fn playback_play(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.play())
}

#[tauri::command]
pub fn playback_pause(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.pause())
}

#[tauri::command]
pub fn playback_seek(
    state: State<AppState>,
    frame: i64,
) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.seek(frame.max(0)))
}

/// The timeline changed. A stopped playhead redraws its frame; a playing one
/// ignores it, because the frame source is already reading the edit it was
/// built from and rebuilding mid-playback would be a stall.
#[tauri::command]
pub fn playback_redraw(state: State<AppState>) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.redraw())
}

#[tauri::command]
pub fn playback_place(state: State<AppState>, place: MonitorPlace) -> Option<PlaybackStatus> {
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
    playback_session(&state).map(|session| session.status())
}

fn with_session<F>(state: &State<AppState>, act: F) -> Option<PlaybackStatus>
where
    F: FnOnce(&Session),
{
    let session = playback_session(state)?;
    act(&session);
    Some(session.status())
}

fn with_session_result<F>(
    state: &State<AppState>,
    act: F,
) -> Result<Option<PlaybackStatus>, String>
where
    F: FnOnce(&Session) -> Result<(), String>,
{
    let Some(session) = playback_session(state) else {
        return Ok(None);
    };
    act(&session)?;
    Ok(Some(session.status()))
}

fn playback_session(state: &State<AppState>) -> Option<Arc<Session>> {
    clone_arc(&state.playback)
}

fn clone_arc<T>(slot: &Mutex<Option<Arc<T>>>) -> Option<Arc<T>> {
    slot.lock().unwrap().as_ref().map(Arc::clone)
}

fn store_if_current<T>(
    slot: &Mutex<Option<Arc<T>>>,
    epoch: &AtomicU64,
    started_at: u64,
    value: Arc<T>,
) -> Result<(), Arc<T>> {
    let mut slot = slot.lock().unwrap();
    if epoch.load(Ordering::SeqCst) != started_at || slot.is_some() {
        return Err(value);
    }
    *slot = Some(value);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        automatic_playback_backend, clone_arc, explicit_playback_backend, lenient_cache_matches,
        native_preview_dimensions, playback_change, playback_guides_changed,
        playback_video_settings_changed, process_metrics_rows, process_tree_rss_bytes,
        proxy_refresh_should_retry, restore_if_current, srt_contents, srt_cues, srt_frame,
        srt_timestamp, store_if_current, strict_cache_matches, validate_strict_compositor,
        wanted_device, PlaybackChange, PlaybackSettingsGate, Settings,
    };
    use makevideo_compositor::{Backend, Compositor};
    use makevideo_render::Rate;
    use std::sync::atomic::AtomicU64;
    use std::sync::mpsc::channel;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[test]
    fn an_unset_graphics_device_is_the_automatic_pick() {
        assert_eq!(wanted_device(""), None);
        assert_eq!(wanted_device("   "), None);
        assert_eq!(wanted_device("Apple M3 Pro"), Some("Apple M3 Pro"));
    }

    #[test]
    fn startup_is_lenient_but_an_explicit_live_gpu_choice_is_strict() {
        let settings = Settings::default();
        assert_eq!(automatic_playback_backend(&settings), Backend::Auto);
        assert_eq!(explicit_playback_backend(&settings), Backend::Gpu);

        let mut cpu = settings;
        cpu.compositor = "cpu".into();
        assert_eq!(automatic_playback_backend(&cpu), Backend::Cpu);
        assert_eq!(explicit_playback_backend(&cpu), Backend::Cpu);
    }

    #[test]
    fn strict_validation_rechecks_a_cached_compositor() {
        let cpu = Compositor::with_backend(Backend::Cpu).unwrap();
        assert!(validate_strict_compositor(Backend::Gpu, None, &cpu).is_err());
        assert!(validate_strict_compositor(Backend::Cpu, Some("missing adapter"), &cpu).is_err());
        assert!(validate_strict_compositor(Backend::Cpu, None, &cpu).is_ok());
    }

    #[test]
    fn named_gpu_reuses_the_actual_default_adapter_and_creates_an_alias() {
        let default_key = (Backend::Auto, String::new());
        assert!(strict_cache_matches(
            Backend::Gpu,
            Some("Apple M3"),
            &default_key,
            true,
            "Apple M3",
        ));
        assert!(lenient_cache_matches(
            Backend::Auto,
            Some("Apple M3"),
            &default_key,
            true,
            "Apple M3",
        ));
    }

    #[test]
    fn clearing_a_named_gpu_uses_only_the_default_cache_identity() {
        let named_key = (Backend::Gpu, "Discrete GPU".into());
        let default_key = (Backend::Auto, String::new());
        assert!(!strict_cache_matches(
            Backend::Gpu,
            None,
            &named_key,
            true,
            "Discrete GPU",
        ));
        assert!(strict_cache_matches(
            Backend::Gpu,
            None,
            &default_key,
            true,
            "Default GPU",
        ));
        assert!(!lenient_cache_matches(
            Backend::Auto,
            None,
            &named_key,
            true,
            "Discrete GPU",
        ));
    }

    #[test]
    fn automatic_refresh_waits_for_every_explicit_settings_transaction() {
        let gate = Arc::new(PlaybackSettingsGate::default());
        let first = gate.enter();
        let second = gate.enter();
        let (sent, received) = channel();
        let waiting = Arc::clone(&gate);
        let thread = std::thread::spawn(move || {
            waiting.wait();
            let _ = sent.send(());
        });

        assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
        drop(first);
        assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
        drop(second);
        assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
        thread.join().unwrap();
    }

    #[test]
    fn explicit_settings_wait_until_an_attach_snapshot_is_stored() {
        let gate = Arc::new(PlaybackSettingsGate::default());
        let attach = gate.enter_attach();
        let (sent, received) = channel();
        let waiting = Arc::clone(&gate);
        let thread = std::thread::spawn(move || {
            let _settings = waiting.enter();
            let _ = sent.send(());
        });

        assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
        drop(attach);
        assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
        thread.join().unwrap();
    }

    #[test]
    fn attach_waits_until_the_latest_settings_transaction_finishes() {
        let gate = Arc::new(PlaybackSettingsGate::default());
        let settings = gate.enter();
        let (sent, received) = channel();
        let waiting = Arc::clone(&gate);
        let thread = std::thread::spawn(move || {
            let _attach = waiting.enter_attach();
            let _ = sent.send(());
        });

        assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
        drop(settings);
        assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
        thread.join().unwrap();
    }

    #[test]
    fn proxy_refresh_waits_for_an_attaching_session_before_lookup() {
        let gate = Arc::new(PlaybackSettingsGate::default());
        let attach = gate.enter_attach();
        let (sent, received) = channel();
        let waiting = Arc::clone(&gate);
        let thread = std::thread::spawn(move || {
            waiting.wait();
            let _ = sent.send(());
        });

        assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
        drop(attach);
        assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
        thread.join().unwrap();
    }

    #[test]
    fn an_auto_refresh_retries_the_explicit_priority_race() {
        assert!(proxy_refresh_should_retry(
            crate::playback::EXPLICIT_RECONFIGURE_PENDING
        ));
        assert!(!proxy_refresh_should_retry("candidate surface refused"));
    }

    #[test]
    fn guide_only_changes_do_not_choose_the_video_replacement_path() {
        let before = Settings::default();
        let mut after = before.clone();
        after.show_rule_of_thirds = true;
        assert!(playback_guides_changed(&before, &after));
        assert!(!playback_video_settings_changed(&before, &after));

        after.preview_quality = "full".into();
        assert!(playback_video_settings_changed(&before, &after));
    }

    #[test]
    fn reverting_to_confirmed_settings_replaces_an_unconfirmed_live_candidate() {
        let mut confirmed = Settings::default();
        confirmed.preview_quality = "full".into();
        let mut first = confirmed.clone();
        first.preview_quality = "half".into();

        assert_eq!(
            playback_change(&confirmed, &first, false),
            PlaybackChange::Video
        );
        assert_eq!(
            playback_change(&confirmed, &confirmed, false),
            PlaybackChange::None
        );
        assert_eq!(
            playback_change(&confirmed, &confirmed, true),
            PlaybackChange::Video
        );
    }

    #[test]
    fn cloning_a_playback_handle_releases_the_registry_lock_before_waiting() {
        let slot = Mutex::new(Some(Arc::new(7)));
        let handle = clone_arc(&slot).unwrap();
        assert!(slot.try_lock().is_ok());
        assert_eq!(*handle, 7);
    }

    #[test]
    fn release_epoch_prevents_a_late_attach_from_repopulating_the_registry() {
        let slot = Mutex::new(None);
        let epoch = AtomicU64::new(4);
        let started_at = epoch.load(std::sync::atomic::Ordering::SeqCst);
        epoch.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        let rejected = store_if_current(&slot, &epoch, started_at, Arc::new(7));
        assert!(rejected.is_err());
        assert!(slot.lock().unwrap().is_none());
    }

    #[test]
    fn newest_failed_setting_restores_confirmed_playback_after_older_commit() {
        let latest = AtomicU64::new(2);
        let live = AtomicU64::new(1);
        assert_eq!(
            restore_if_current(&latest, 2, || {
                live.store(0, std::sync::atomic::Ordering::Relaxed);
                Ok(())
            }),
            None
        );
        assert_eq!(live.load(std::sync::atomic::Ordering::Relaxed), 0);

        latest.store(3, std::sync::atomic::Ordering::Relaxed);
        let _ = restore_if_current(&latest, 2, || {
            live.store(9, std::sync::atomic::Ordering::Relaxed);
            Ok(())
        });
        assert_eq!(live.load(std::sync::atomic::Ordering::Relaxed), 0);
    }

    #[test]
    fn srt_frame_accepts_comma_and_dot_milliseconds() {
        let rate = Rate::fps(30);
        assert_eq!(srt_frame("00:01:02,500", rate), Ok(1_875));
        assert_eq!(srt_frame("00:01:02.500", rate), Ok(1_875));
    }

    #[test]
    fn srt_timestamp_round_trips_within_one_frame() {
        let rate = Rate::new(30_000, 1_001);
        let frame = 12_345;
        let parsed = srt_frame(&srt_timestamp(frame, rate), rate).unwrap();
        assert!((parsed - frame).abs() <= 1);
    }

    #[test]
    fn srt_cues_keep_multiline_text_and_export_in_start_order() {
        let rate = Rate::fps(30);
        let cues = srt_cues(
            "2\n00:00:02,000 --> 00:00:03,000\nsecond\n\n1\n00:00:00,000 --> 00:00:01,000\nfirst\nline",
            rate,
        )
        .unwrap();
        let output = srt_contents(
            cues.iter()
                .map(|(start, end, text)| (*start, *end, text.as_str()))
                .collect(),
            rate,
        );

        assert_eq!(
            output,
            "1\n00:00:00,000 --> 00:00:01,000\nfirst\nline\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond\n\n"
        );
    }

    #[test]
    fn existing_settings_delete_the_project_folder_by_default() {
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert!(settings.delete_project_folder);
    }

    #[test]
    fn monitor_guides_are_off_by_default() {
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert!(!settings.show_action_safe_area);
        assert!(!settings.show_title_safe_area);
        assert!(!settings.show_rule_of_thirds);
        assert!(!settings.show_center_lines);
    }

    #[test]
    fn native_monitor_honours_preview_quality() {
        assert_eq!(native_preview_dimensions(1920, 1080, "full"), (1920, 1080));
        assert_eq!(native_preview_dimensions(1920, 1080, "half"), (960, 540));
        assert_eq!(native_preview_dimensions(1920, 1080, "quarter"), (480, 270));
        assert_eq!(native_preview_dimensions(1080, 1920, "quarter"), (270, 480));
    }

    #[test]
    fn memory_includes_descendants_but_not_neighbours() {
        let ps = "10 1 100\n11 10 20\n12 11 5\n20 1 900\n";
        assert_eq!(process_tree_rss_bytes(ps, 10), 125 * 1024);
    }

    #[test]
    fn process_metrics_rejects_invalid_rows() {
        assert!(process_metrics_rows("10 1 100 0.2\nbroken row\n").is_err());
    }
}
