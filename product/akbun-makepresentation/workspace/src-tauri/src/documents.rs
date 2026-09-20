use makepresentation_desktop::Profile;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager};

/// The profile the commands read settings and AI sessions from. A window that
/// holds no document adopts the file it opens, so the profile is swapped in
/// place instead of a second process being started for it.
pub struct ActiveProfile(pub RwLock<Profile>);

/// The path the page loads on startup. macOS hands a double-clicked file over
/// as an Opened event rather than an argument, and that event can arrive before
/// the page asks; `taken` tells the two apart.
pub struct InitialDocument {
    path: Option<String>,
    taken: bool,
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let path = args
        .windows(2)
        .find(|pair| pair[0] == "--deck")
        .map(|pair| pair[1].clone())
        .or_else(|| {
            args.iter()
                .find(|arg| arg.to_lowercase().ends_with(".pptx"))
                .cloned()
        });
    let profile = Profile::open(&app.path().app_data_dir()?, path.as_deref().map(Path::new))?;
    app.manage(ActiveProfile(RwLock::new(profile)));
    app.manage(Mutex::new(InitialDocument { path, taken: false }));
    Ok(())
}

pub fn profile_directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .state::<ActiveProfile>()
        .0
        .read()
        .map_err(|_| "cannot read the document profile".to_string())?
        .directory
        .clone())
}

pub fn remember_saved_document(app: &AppHandle, path: &Path) -> Result<(), String> {
    app.state::<ActiveProfile>()
        .0
        .read()
        .map_err(|_| "cannot read the document profile".to_string())?
        .remember_saved_document(path)
}

fn deck_path(path: String) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !canonical.is_file() {
        return Err("Select a PowerPoint file.".into());
    }
    Ok(canonical)
}

/// Switches this process to the profile of `path`, the way it would have
/// started had the file been its argument. The AI session directory of the new
/// profile is granted to the asset protocol so saved images keep loading.
fn adopt_profile(app: &AppHandle, path: &Path) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let profile = Profile::open(&base, Some(path))?;
    let state = app.state::<ActiveProfile>();
    let mut active = state
        .0
        .write()
        .map_err(|_| "cannot switch the document profile".to_string())?;
    *active = profile;
    drop(active);
    crate::ai::allow_profile_images(app)
}

#[tauri::command]
pub fn initial_document(app: AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<Mutex<InitialDocument>>();
    let mut startup = state
        .lock()
        .map_err(|_| "cannot read the startup document".to_string())?;
    startup.taken = true;
    Ok(startup.path.clone())
}

/// Opens `path` in this window: the page then loads the deck itself. Only a
/// window without a document calls this; one that already shows a file asks
/// for a separate process instead.
#[tauri::command]
pub fn adopt_document(app: AppHandle, path: String) -> Result<String, String> {
    let canonical = deck_path(path)?;
    adopt_profile(&app, &canonical)?;
    Ok(canonical.to_string_lossy().into())
}

#[cfg(target_os = "macos")]
/// A file the operating system asked this process to open. Before the page has
/// asked for its startup document the file simply becomes that document; after
/// that the page decides whether its window is free to show it.
pub fn open_requested(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let canonical = deck_path(path.to_string_lossy().into())?;
    let state = app.state::<Mutex<InitialDocument>>();
    let mut startup = state
        .lock()
        .map_err(|_| "cannot read the startup document".to_string())?;
    if !startup.taken && startup.path.is_none() {
        adopt_profile(app, &canonical)?;
        startup.path = Some(canonical.to_string_lossy().into());
        return Ok(());
    }
    drop(startup);
    app.emit("document-open-request", canonical.to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn launch_document(path: Option<String>) -> Result<(), String> {
    let mut command = Command::new(std::env::current_exe().map_err(|error| error.to_string())?);
    if let Some(path) = path {
        command.arg("--deck").arg(deck_path(path)?);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot open independent app: {error}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
