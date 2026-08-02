//! The whole IPC surface.
//!
//! The page picks paths with native dialogs and hands them over; everything
//! that touches the file system or spawns a process happens here. That keeps
//! capabilities/default.json short, because the webview never needs a file
//! system scope of its own.

use makevideo_render::{ffmpeg, probe, tools, Asset, AssetKind, Project};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
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
    /// Folder holding ffmpeg and ffprobe. Empty means look in the usual places.
    pub ffmpeg_dir: String,
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
            ffmpeg_dir: String::new(),
        }
    }
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    /// The running ffmpeg, so Cancel has something to kill. Shared with the
    /// thread that reads its progress.
    pub render: Arc<Mutex<Option<Child>>>,
    pub cancelled: Arc<AtomicBool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub version: String,
    pub data_dir: String,
    /// None when the tool could not be found, which the page turns into a
    /// banner rather than a failure at render time.
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
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

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<AppState>) -> Bootstrap {
    let settings = state.settings.lock().unwrap().clone();
    Bootstrap {
        version: app.package_info().version.to_string(),
        data_dir: crate::store::data_dir(&app),
        ffmpeg: find_tool("ffmpeg", &settings.ffmpeg_dir),
        ffprobe: find_tool("ffprobe", &settings.ffmpeg_dir),
        settings,
    }
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Bootstrap, String> {
    apply_theme(&app, &settings.theme);
    crate::store::save_settings(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
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

#[tauri::command]
pub fn save_project(path: String, project: Project) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&project).map_err(|error| error.to_string())?;
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
}

/// ffmpeg's own error text, trimmed to something a dialog can hold.
fn tail(text: &str) -> String {
    let trimmed = text.trim();
    match trimmed.char_indices().nth_back(2000) {
        Some((index, _)) => format!("…{}", &trimmed[index..]),
        None => trimmed.to_string(),
    }
}

/// Starts ffmpeg and returns as soon as it is running. Progress arrives as
/// `render:progress` events and the outcome as one `render:done`.
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
    let args = ffmpeg::build_args(&project, &path, preset)?;
    let total_ms = project.duration_ms();
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let program = find_tool("ffmpeg", &configured).ok_or_else(|| {
        "ffmpeg was not found. Install it with `brew install ffmpeg`, or point Settings at the \
         folder that holds it."
            .to_string()
    })?;

    let mut child = Command::new(&program)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start {program}: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("ffmpeg produced no progress pipe")?;
    let mut stderr = child.stderr.take().ok_or("ffmpeg produced no error pipe")?;

    state.cancelled.store(false, Ordering::SeqCst);
    *state.render.lock().unwrap() = Some(child);

    // stderr has to be drained even when nobody reads it, or a chatty failure
    // fills the pipe and ffmpeg blocks on a write that never completes.
    let errors = Arc::new(Mutex::new(String::new()));
    {
        let errors = Arc::clone(&errors);
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *errors.lock().unwrap() = text;
        });
    }

    let shared = Arc::clone(&state.render);
    let cancelled = Arc::clone(&state.cancelled);
    std::thread::spawn(move || {
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
        // The pipe closed, so ffmpeg has either finished or been killed.
        let status = shared
            .lock()
            .unwrap()
            .take()
            .and_then(|mut child| child.wait().ok());
        let was_cancelled = cancelled.swap(false, Ordering::SeqCst);
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
        let _ = app.emit(
            "render:done",
            RenderDone {
                ok,
                cancelled: was_cancelled,
                path,
                message,
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
