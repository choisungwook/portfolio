use makepresentation_desktop::Profile;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

pub struct InitialDocument(pub Option<String>);

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
    app.manage(profile);
    app.manage(InitialDocument(path));
    Ok(())
}

#[tauri::command]
pub fn initial_document(app: AppHandle) -> Option<String> {
    app.state::<InitialDocument>().0.clone()
}

#[tauri::command]
pub fn launch_document(path: Option<String>) -> Result<(), String> {
    let mut command = Command::new(std::env::current_exe().map_err(|error| error.to_string())?);
    if let Some(path) = path {
        let canonical = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
        if !canonical.is_file() {
            return Err("Select a PowerPoint file.".into());
        }
        command.arg("--deck").arg(canonical);
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
