// Everything the window can ask for. Each command is a thin wrapper over
// awsviewer-core: profile and session state come from ~/.aws, EC2 data from
// the selected profile's role credentials. Nothing here mutates anything on
// AWS — the core crate only exposes list/describe calls.

use awsviewer_core::{creds, ec2, profiles, ssocache, CoreError, Profile, RoleCredentials};
use crate::clilogin;
use crate::store::{self, Settings};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// The label is fixed so a second login attempt replaces the first window
/// instead of stacking a new one.
const LOGIN_WINDOW: &str = "sso-login";

/// The page listens for this to open its modal. The payload is the sign-in
/// URL and code the AWS CLI printed.
const VERIFICATION_EVENT: &str = "aws-login-verification";

/// Role credentials are cached per profile until shortly before they expire,
/// so switching tabs does not call GetRoleCredentials again every time.
const CREDS_SKEW_MS: i64 = 60_000;

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub creds_cache: Mutex<HashMap<String, RoleCredentials>>,
    /// The sign-in URL of the login attempt in flight. Kept here so the
    /// modal's "Open sign-in window again" button needs no URL of its own —
    /// the page never gets to name a URL for the app to open in a window.
    pub login_url: Mutex<Option<String>>,
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

/// What the page's login modal shows while the CLI waits.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub profile: String,
    pub url: String,
    pub user_code: Option<String>,
}

/// Signs in by running `aws sso login --profile <selected>` and relaying its
/// browser step: the URL the CLI prints opens in an app window, the page shows
/// the same URL and code in a modal, and this resolves when the CLI exits.
/// Closing the sign-in window kills the CLI, which cancels the flow.
///
/// The CLI writes ~/.aws/sso/cache, which is the same cache this app reads, so
/// there is nothing to save here — the session is read back the way any other
/// session is.
#[tauri::command]
pub async fn cli_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionStatus, CoreError> {
    let (profile, _) = selected_profile(&state)?;
    // A profile with no sso block cannot be signed in to at all, and saying so
    // here is clearer than the CLI's own message about a missing key.
    if profile.sso.is_none() {
        return Err(CoreError::NoSso {
            message: format!(
                "profile {} has no IAM Identity Center configuration; this app does not use access keys",
                profile.name
            ),
        });
    }

    *state.login_url.lock().unwrap() = None;
    let name = profile.name.clone();
    let relay = app.clone();
    let watcher = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        clilogin::run_login(
            &name.clone(),
            |found| {
                if let Err(error) = start_relay(&relay, &name, &found) {
                    log::error!("cannot open the sign-in window: {error}");
                }
            },
            login_window_watcher(watcher),
        )
    })
    .await
    .map_err(|error| io_error(format!("login task failed: {error}")))?;

    close_login_window(&app);
    *state.login_url.lock().unwrap() = None;
    result?;

    state.creds_cache.lock().unwrap().clear();
    // The CLI reported success, so a session that still reads as logged out
    // means it wrote a cache file this app looks for elsewhere. Say that
    // rather than leaving the page claiming a login that buys nothing.
    session_for(&profile)
        .filter(|session| session.logged_in)
        .ok_or_else(|| CoreError::LoginRequired {
            message: format!(
                "aws sso login finished but no valid session was found for profile {}",
                profile.name
            ),
        })
}

/// Answers "is the user still in the sign-in window?" for the login task.
///
/// Window creation is queued onto the main thread, so the window does not
/// exist the instant the relay starts and a plain is_some() check would read
/// that gap as a cancelled login. Absence only means cancelled after the
/// window has been seen once; before that it means "not open yet", bounded so
/// a window that never opens does not wait out the whole flow.
fn login_window_watcher(app: AppHandle) -> impl Fn() -> bool + Send + 'static {
    let seen = std::cell::Cell::new(false);
    let since = std::time::Instant::now();
    move || {
        if app.get_webview_window(LOGIN_WINDOW).is_some() {
            seen.set(true);
            return true;
        }
        !seen.get() && since.elapsed() < std::time::Duration::from_secs(90)
    }
}

/// Opens the relay window and tells the page, in that order: the window is the
/// thing the user needs, the modal only explains it.
fn start_relay(app: &AppHandle, profile: &str, found: &awsviewer_core::awscli::Verification) -> Result<(), CoreError> {
    open_login_window(app, &found.url)?;
    let payload = Verification {
        profile: profile.to_string(),
        url: found.url.clone(),
        user_code: found.user_code.clone(),
    };
    if let Some(state) = app.try_state::<AppState>() {
        *state.login_url.lock().unwrap() = Some(found.url.clone());
    }
    app.emit(VERIFICATION_EVENT, payload)
        .map_err(|error| io_error(format!("cannot notify the page: {error}")))
}

/// Reopens the sign-in window for the login in flight. Closing that window is
/// how the flow is cancelled, so a user who closes it by accident needs a way
/// back in that does not restart the CLI.
#[tauri::command]
pub fn reopen_login_window(app: AppHandle, state: State<'_, AppState>) -> Result<(), CoreError> {
    let url = state
        .login_url
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| io_error("no sign-in is in progress".to_string()))?;
    open_login_window(&app, &url)
}

/// Cancels the login in flight by closing the sign-in window, which is the
/// one signal the login task polls.
#[tauri::command]
pub fn cancel_login(app: AppHandle) {
    close_login_window(&app);
}

fn close_login_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = window.close();
    }
}

/// Windows must be built on the main thread on macOS, and this is called from
/// the blocking login task, so the build is handed back to the main thread.
fn open_login_window(app: &AppHandle, url: &str) -> Result<(), CoreError> {
    let parsed: tauri::Url = url
        .parse()
        .map_err(|error| io_error(format!("bad verification url: {error}")))?;
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Some(previous) = handle.get_webview_window(LOGIN_WINDOW) {
            let _ = previous.destroy();
        }
        let built = tauri::WebviewWindowBuilder::new(
            &handle,
            LOGIN_WINDOW,
            tauri::WebviewUrl::External(parsed),
        )
        .title("AWS sign-in")
        .inner_size(520.0, 720.0)
        .build();
        if let Err(error) = built {
            log::error!("cannot open login window: {error}");
        }
    })
    .map_err(|error| io_error(format!("cannot open login window: {error}")))
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
