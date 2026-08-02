//! The command surface the page invokes.
//!
//! Two rules, both borrowed from the other products in this repository and both
//! worth keeping.
//!
//! Every mutating command answers with the whole state and the page redraws
//! from it. Nothing here sends a partial update, so the page never has to merge
//! one into a copy of its own that could drift.
//!
//! No blocking native dialog runs inside a command. The page opens the file
//! picker and hands a path over, which keeps the dialog off whatever thread
//! tauri happens to run a command on.

use crate::audio::{AudioEngine, Devices, RecordingInfo, Take};
use crate::store;
use makepodcast_recorder::{next_take_name, sanitize_project_name, Settings};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

/// The recording session: which project is open, and the take in track A.
///
/// There is one track on purpose. A podcast episode recorded on one interface
/// is one track, and a second track would need mixing, sync and a timeline the
/// app does not have yet.
#[derive(Default)]
pub struct Session {
    pub project: Option<Project>,
    pub take: Option<Take>,
    pub devices: Devices,
    /// The device and format capture actually opened with. The page needs the
    /// sample rate to put the timeline marks in the right place, and assuming
    /// 48 kHz puts every mark nine percent out on a 44.1 kHz interface.
    pub recording: Option<RecordingInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub dir: String,
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub session: Mutex<Session>,
    pub engine: Mutex<AudioEngine>,
}

/// Everything the page draws, in one round trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: Settings,
    /// The setting resolved to a real path, so the page can show where takes
    /// land without repeating the fallback rule.
    pub project_dir: String,
    /// Where settings.json is, which is not always the same folder.
    pub app_dir: String,
    pub devices: Devices,
    pub project: Option<Project>,
    pub take: Option<Take>,
    pub recording: Option<RecordingInfo>,
    /// `idle`, `recording` or `playing`.
    pub status: &'static str,
    pub version: String,
}

pub fn snapshot(app: &AppHandle, state: &AppState) -> Snapshot {
    let settings = state.settings.lock().expect("settings lock").clone();
    let session = state.session.lock().expect("session lock");
    let engine = state.engine.lock().expect("engine lock");
    Snapshot {
        project_dir: store::project_dir(app, &settings).to_string_lossy().to_string(),
        app_dir: store::app_dir(app).to_string_lossy().to_string(),
        settings,
        devices: session.devices.clone(),
        project: session.project.clone(),
        take: session.take.clone(),
        recording: session.recording.clone(),
        status: if engine.is_recording() {
            "recording"
        } else if engine.is_playing() {
            "playing"
        } else {
            "idle"
        },
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn get_state(app: AppHandle, state: State<AppState>) -> Snapshot {
    snapshot(&app, &state)
}

/// Ask the host again. An interface plugged in after the app started is only
/// visible after this, which is why the page has a refresh next to the list.
#[tauri::command]
pub fn refresh_devices(app: AppHandle, state: State<AppState>) -> Snapshot {
    let devices = crate::audio::list_devices();
    state.session.lock().expect("session lock").devices = devices;
    snapshot(&app, &state)
}

/// Create a project folder and clear track A.
///
/// The name is sanitized rather than rejected. A title with a colon in it is a
/// normal episode name and the user should not have to learn which characters
/// a file system dislikes.
#[tauri::command]
pub fn new_project(app: AppHandle, state: State<AppState>, name: String) -> Result<Snapshot, String> {
    {
        let mut engine = state.engine.lock().expect("engine lock");
        if engine.is_recording() {
            return Err("Stop recording before starting a new project.".to_string());
        }
        engine.stop_playback();
    }
    let settings = state.settings.lock().expect("settings lock").clone();
    let root = store::project_dir(&app, &settings);
    let project = create_project(&root, &name)?;
    let mut session = state.session.lock().expect("session lock");
    session.project = Some(project);
    session.take = None;
    session.recording = None;
    drop(session);
    Ok(snapshot(&app, &state))
}

fn create_project(root: &Path, name: &str) -> Result<Project, String> {
    let dir = root.join(sanitize_project_name(name));
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    Ok(Project {
        name: dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        dir: dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn start_recording(app: AppHandle, state: State<AppState>) -> Result<Snapshot, String> {
    let settings = state.settings.lock().expect("settings lock").clone();
    let root = store::project_dir(&app, &settings);

    // Recording with no project open is the first thing a user does after
    // installing, so an untitled project is created rather than refused.
    let mut session = state.session.lock().expect("session lock");
    let project = match session.project.clone() {
        Some(project) => project,
        None => {
            let project = create_project(&root, "untitled")?;
            session.project = Some(project.clone());
            project
        }
    };
    let dir = PathBuf::from(&project.dir);
    let path = dir.join(next_take_name(&existing_takes(&dir)));
    drop(session);

    let info = state
        .engine
        .lock()
        .expect("engine lock")
        .start_recording(settings.input_device.as_deref(), &path)?;
    state.session.lock().expect("session lock").recording = Some(info);
    Ok(snapshot(&app, &state))
}

/// The wav files already in the project folder, so numbering continues instead
/// of overwriting the take recorded before lunch.
fn existing_takes(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
pub fn stop_recording(app: AppHandle, state: State<AppState>) -> Result<Snapshot, String> {
    let take = state.engine.lock().expect("engine lock").stop_recording()?;
    let mut session = state.session.lock().expect("session lock");
    session.take = Some(take);
    session.recording = None;
    drop(session);
    Ok(snapshot(&app, &state))
}

#[tauri::command]
pub fn start_playback(app: AppHandle, state: State<AppState>) -> Result<Snapshot, String> {
    let settings = state.settings.lock().expect("settings lock").clone();
    let take = state
        .session
        .lock()
        .expect("session lock")
        .take
        .clone()
        .ok_or_else(|| "Nothing recorded yet.".to_string())?;
    state.engine.lock().expect("engine lock").start_playback(
        Path::new(&take.path),
        settings.output_device.as_deref(),
        settings.volume,
    )?;
    Ok(snapshot(&app, &state))
}

#[tauri::command]
pub fn stop_playback(app: AppHandle, state: State<AppState>) -> Snapshot {
    state.engine.lock().expect("engine lock").stop_playback();
    snapshot(&app, &state)
}

/// Copy the take to wherever the user chose in the save dialog.
///
/// A copy and not a move: the take stays in the project folder, so exporting a
/// wav to a share cannot leave the project without its own recording.
#[tauri::command]
pub fn save_wav(app: AppHandle, state: State<AppState>, path: String) -> Result<Snapshot, String> {
    let take = state
        .session
        .lock()
        .expect("session lock")
        .take
        .clone()
        .ok_or_else(|| "Nothing recorded yet.".to_string())?;
    if state.engine.lock().expect("engine lock").is_recording() {
        return Err("Stop recording before saving.".to_string());
    }
    std::fs::copy(&take.path, &path)
        .map_err(|error| format!("cannot save {path}: {error}"))?;
    Ok(snapshot(&app, &state))
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Snapshot, String> {
    let settings = settings.normalized();
    store::save_settings(&app, &settings)?;
    // Live, so dragging the volume slider is heard during playback rather than
    // on the next take.
    state.engine.lock().expect("engine lock").set_volume(settings.volume);
    *state.settings.lock().expect("settings lock") = settings;
    Ok(snapshot(&app, &state))
}

/// Open the project folder in the file manager, which is how a user gets at a
/// take without the save dialog.
#[tauri::command]
pub fn open_project_dir(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let settings = state.settings.lock().expect("settings lock").clone();
    let dir = match state.session.lock().expect("session lock").project.clone() {
        Some(project) => PathBuf::from(project.dir),
        None => store::project_dir(&app, &settings),
    };
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {dir:?}: {error}"))?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}
