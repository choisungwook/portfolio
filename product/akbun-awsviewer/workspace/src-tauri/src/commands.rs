// Everything the window can ask for. Each command is a thin wrapper over
// awsviewer-core: profile and session state come from ~/.aws, EC2 data from
// the selected profile's role credentials. Nothing here mutates anything on
// AWS — the core crate only exposes list/describe calls.

use awsviewer_core::{creds, ec2, login, profiles, ssocache, CoreError, Profile, RoleCredentials};
use crate::store::{self, Settings};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// The label is fixed so a second login attempt replaces the first window
/// instead of stacking a new one.
const LOGIN_WINDOW: &str = "sso-login";

/// Role credentials are cached per profile until shortly before they expire,
/// so switching tabs does not call GetRoleCredentials again every time.
const CREDS_SKEW_MS: i64 = 60_000;

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub creds_cache: Mutex<HashMap<String, RoleCredentials>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub logged_in: bool,
    pub expires_at: Option<String>,
}

/// Everything the page needs on load, in one round trip.
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

/// The selected profile with its settings, cloned out of the state so no lock
/// is held across an await.
fn selected_profile(state: &State<'_, AppState>) -> Result<(Profile, bool), CoreError> {
    let settings = state.settings.lock().unwrap().clone();
    let name = settings.profile.ok_or_else(|| CoreError::NoSso {
        message: "no profile is selected".to_string(),
    })?;
    let profile = read_profiles()?
        .into_iter()
        .find(|p| p.name == name)
        .ok_or_else(|| CoreError::NoSso {
            message: format!("profile {name} is not in ~/.aws/config"),
        })?;
    Ok((profile, settings.insecure_tls))
}

fn session_for(profile: &Profile) -> Option<SessionStatus> {
    let sso = profile.sso.as_ref()?;
    let path = ssocache::cache_path(&home_dir().ok()?, sso);
    let status = match ssocache::load_token(&path) {
        Some(token) if ssocache::is_valid(&token) => SessionStatus {
            logged_in: true,
            expires_at: Some(token.expires_at),
        },
        _ => SessionStatus {
            logged_in: false,
            expires_at: None,
        },
    };
    Some(status)
}

fn snapshot(app: &AppHandle, state: &State<'_, AppState>) -> Result<Snapshot, CoreError> {
    let profiles = read_profiles()?;
    let settings = state.settings.lock().unwrap().clone();
    let session = settings
        .profile
        .as_ref()
        .and_then(|name| profiles.iter().find(|p| &p.name == name))
        .and_then(session_for);
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
pub fn get_snapshot(app: AppHandle, state: State<'_, AppState>) -> Result<Snapshot, CoreError> {
    snapshot(&app, &state)
}

fn log_dir(app: &AppHandle) -> Result<PathBuf, CoreError> {
    app.path()
        .app_log_dir()
        .map_err(|error| io_error(format!("no log directory: {error}")))
}

/// Reveals the error log folder in Finder. The bundle only targets macOS
/// (app/dmg), so `open` is enough.
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
pub fn select_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<Snapshot, CoreError> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.profile = Some(name);
        store::save_settings(&app, &settings).map_err(io_error)?;
    }
    state.creds_cache.lock().unwrap().clear();
    snapshot(&app, &state)
}

#[tauri::command]
pub fn set_insecure_tls(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<Snapshot, CoreError> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.insecure_tls = enabled;
        store::save_settings(&app, &settings).map_err(io_error)?;
    }
    snapshot(&app, &state)
}

/// Runs the whole device authorization flow: opens the Identity Center page
/// in its own window, waits for approval there, writes the token cache and
/// resolves. Closing the window cancels the wait.
#[tauri::command]
pub async fn sso_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionStatus, CoreError> {
    let (profile, insecure) = selected_profile(&state)?;
    let sso = profile.sso.clone().ok_or_else(|| CoreError::NoSso {
        message: format!(
            "profile {} has no IAM Identity Center configuration; this app does not use access keys",
            profile.name
        ),
    })?;

    let auth = login::request_device_authorization(&sso, insecure).await?;
    open_login_window(&app, &auth.verification_uri_complete)?;

    let watcher = app.clone();
    let result = login::wait_for_token(&sso, &auth, insecure, move || {
        watcher.get_webview_window(LOGIN_WINDOW).is_some()
    })
    .await;

    if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = window.close();
    }

    let token = result?;
    let path = ssocache::cache_path(&home_dir()?, &sso);
    ssocache::save_token(&path, &token)
        .map_err(|error| io_error(format!("cannot write token cache: {error}")))?;
    state.creds_cache.lock().unwrap().clear();

    Ok(SessionStatus {
        logged_in: true,
        expires_at: Some(token.expires_at),
    })
}

fn open_login_window(app: &AppHandle, url: &str) -> Result<(), CoreError> {
    if let Some(previous) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = previous.destroy();
    }
    let parsed: tauri::Url = url
        .parse()
        .map_err(|error| io_error(format!("bad verification url: {error}")))?;
    tauri::WebviewWindowBuilder::new(app, LOGIN_WINDOW, tauri::WebviewUrl::External(parsed))
        .title("AWS sign-in")
        .inner_size(520.0, 720.0)
        .build()
        .map_err(|error| io_error(format!("cannot open login window: {error}")))?;
    Ok(())
}

/// A valid cached token exchanged for role credentials, memoized per profile.
async fn role_credentials(
    state: &State<'_, AppState>,
    profile: &Profile,
    insecure: bool,
) -> Result<RoleCredentials, CoreError> {
    let sso = profile.sso.as_ref().ok_or_else(|| CoreError::NoSso {
        message: format!(
            "profile {} has no IAM Identity Center configuration; this app does not use access keys",
            profile.name
        ),
    })?;

    {
        let cache = state.creds_cache.lock().unwrap();
        if let Some(creds) = cache.get(&profile.name) {
            if creds.expires_at_epoch_ms - CREDS_SKEW_MS
                > ssocache::now_epoch_secs() * 1000
            {
                return Ok(creds.clone());
            }
        }
    }

    let path = ssocache::cache_path(&home_dir()?, sso);
    let token = ssocache::load_token(&path)
        .filter(ssocache::is_valid)
        .ok_or_else(|| CoreError::LoginRequired {
            message: "no valid identity center session for this profile".to_string(),
        })?;

    let creds = creds::fetch_role_credentials(sso, &token.access_token, insecure).await?;
    state
        .creds_cache
        .lock()
        .unwrap()
        .insert(profile.name.clone(), creds.clone());
    Ok(creds)
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
    let creds = role_credentials(&state, &profile, insecure).await?;
    ec2::list_instances(&region, &creds, insecure).await
}

#[tauri::command]
pub async fn instance_detail(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<ec2::InstanceDetail, CoreError> {
    let (profile, insecure) = selected_profile(&state)?;
    let region = region_of(&profile)?;
    let creds = role_credentials(&state, &profile, insecure).await?;
    ec2::instance_detail(&region, &creds, insecure, &instance_id).await
}
