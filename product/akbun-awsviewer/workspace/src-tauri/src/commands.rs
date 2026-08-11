use crate::awscli;
use crate::store::{self, Settings};
use awsviewer_core::{cloudtrail, ec2, profiles, CoreError, Profile, RoleCredentials};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub settings: Mutex<Settings>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub logged_in: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub profiles: Vec<Profile>,
    pub settings: Settings,
    pub session: Option<SessionStatus>,
    pub version: String,
    pub log_dir: String,
}

fn io_error(message: String) -> CoreError {
    CoreError::Io { message }
}

fn home_dir() -> Result<PathBuf, CoreError> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| io_error("HOME is not set".to_string()))
}

fn read_profiles() -> Result<Vec<Profile>, CoreError> {
    let path = home_dir()?.join(".aws").join("config");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(io_error(format!("cannot read {path:?}: {error}"))),
    };
    Ok(profiles::parse_config(&text))
}

fn selected_profile(state: &State<'_, AppState>) -> Result<(Profile, bool), CoreError> {
    let settings = state.settings.lock().unwrap().clone();
    let name = settings.profile.ok_or_else(|| CoreError::Profile {
        message: "no profile is selected".to_string(),
    })?;
    let profile = read_profiles()?
        .into_iter()
        .find(|profile| profile.name == name)
        .ok_or_else(|| CoreError::Profile {
            message: format!("profile {name} is not in ~/.aws/config"),
        })?;
    Ok((profile, settings.insecure_tls))
}

async fn credentials_for(profile: &Profile) -> Result<RoleCredentials, CoreError> {
    let name = profile.name.clone();
    tauri::async_runtime::spawn_blocking(move || awscli::load_credentials(&name))
        .await
        .map_err(|error| io_error(format!("credential task failed: {error}")))?
}

async fn session_for(profile: &Profile) -> SessionStatus {
    SessionStatus {
        logged_in: credentials_for(profile).await.is_ok(),
    }
}

async fn snapshot(app: &AppHandle, state: &State<'_, AppState>) -> Result<Snapshot, CoreError> {
    let profiles = read_profiles()?;
    let settings = state.settings.lock().unwrap().clone();
    let session = match settings
        .profile
        .as_ref()
        .and_then(|name| profiles.iter().find(|profile| &profile.name == name))
    {
        Some(profile) => Some(session_for(profile).await),
        None => None,
    };
    Ok(Snapshot {
        profiles,
        settings,
        session,
        version: app.package_info().version.to_string(),
        log_dir: log_dir(app)
            .map(|dir| dir.display().to_string())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn get_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Snapshot, CoreError> {
    snapshot(&app, &state).await
}

fn log_dir(app: &AppHandle) -> Result<PathBuf, CoreError> {
    app.path()
        .app_log_dir()
        .map_err(|error| io_error(format!("no log directory: {error}")))
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), CoreError> {
    let dir = log_dir(&app)?;
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|error| io_error(format!("cannot open {dir:?}: {error}")))?;
    Ok(())
}

#[tauri::command]
pub async fn select_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<Snapshot, CoreError> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.profile = Some(name);
        store::save_settings(&app, &settings).map_err(io_error)?;
    }
    snapshot(&app, &state).await
}

#[tauri::command]
pub async fn set_insecure_tls(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<Snapshot, CoreError> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.insecure_tls = enabled;
        store::save_settings(&app, &settings).map_err(io_error)?;
    }
    snapshot(&app, &state).await
}

fn region_of(profile: &Profile) -> Result<String, CoreError> {
    profile
        .region
        .clone()
        .ok_or_else(|| CoreError::MissingRegion {
            message: format!(
                "profile {} has no region; add one to ~/.aws/config",
                profile.name
            ),
        })
}

#[tauri::command]
pub async fn list_instances(
    state: State<'_, AppState>,
) -> Result<Vec<ec2::InstanceSummary>, CoreError> {
    let (profile, insecure) = selected_profile(&state)?;
    let region = region_of(&profile)?;
    let credentials = credentials_for(&profile).await?;
    ec2::list_instances(&region, &credentials, insecure).await
}

#[tauri::command]
pub async fn instance_detail(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<ec2::InstanceDetail, CoreError> {
    let (profile, insecure) = selected_profile(&state)?;
    let region = region_of(&profile)?;
    let credentials = credentials_for(&profile).await?;
    ec2::instance_detail(&region, &credentials, insecure, &instance_id).await
}

#[tauri::command]
pub async fn list_cloudtrail_events(
    state: State<'_, AppState>,
    event_name: Option<String>,
) -> Result<Vec<cloudtrail::EventSummary>, CoreError> {
    let (profile, insecure) = selected_profile(&state)?;
    let region = region_of(&profile)?;
    let credentials = credentials_for(&profile).await?;
    cloudtrail::lookup_events(&region, &credentials, insecure, event_name.as_deref()).await
}
