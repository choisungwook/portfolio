//! The whole IPC surface: one HTTP engine command plus the state blob the
//! page persists. The page owns the state and all logic on it; Rust is the
//! network and the disk.

use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
pub struct Header {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSpec {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<Header>,
    #[serde(default)]
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSettings {
    pub verify_ssl: bool,
    pub timeout_secs: u64,
    pub follow_redirects: bool,
}

/// The same shape the web build's worker proxy returns.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<Header>,
    pub body: String,
    pub elapsed_ms: u64,
    pub size_bytes: u64,
}

/// Requests run here rather than in the page: the webview would be bound by
/// CORS and could never skip TLS verification.
#[tauri::command]
pub async fn send_request(
    spec: RequestSpec,
    settings: EngineSettings,
) -> Result<ResponseData, String> {
    let redirects = if settings.follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    let client = reqwest::Client::builder()
        // The settings toggle exists for networks where verification cannot
        // succeed: TLS inspection proxies and self-signed lab servers.
        .danger_accept_invalid_certs(!settings.verify_ssl)
        .timeout(std::time::Duration::from_secs(settings.timeout_secs.max(1)))
        .redirect(redirects)
        .build()
        .map_err(|e| format!("cannot build HTTP client: {e}"))?;

    let method = reqwest::Method::from_bytes(spec.method.to_uppercase().as_bytes())
        .map_err(|_| format!("invalid method: {}", spec.method))?;
    let mut request = client.request(method.clone(), &spec.url);
    for header in &spec.headers {
        request = request.header(&header.key, &header.value);
    }
    if !spec.body.is_empty() && method != reqwest::Method::GET && method != reqwest::Method::HEAD {
        request = request.body(spec.body.clone());
    }

    let started = Instant::now();
    let response = request.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| Header {
            key: name.to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("cannot read response body: {e}"))?;
    Ok(ResponseData {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        // ponytail: binary bodies display as lossy text; add a hex or
        // download view when a real API needs one.
        body: String::from_utf8_lossy(&bytes).into_owned(),
        elapsed_ms: started.elapsed().as_millis() as u64,
        size_bytes: bytes.len() as u64,
    })
}

fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir.join("state.json"))
}

#[tauri::command]
pub fn load_state(app: tauri::AppHandle) -> Result<String, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

#[tauri::command]
pub fn save_state(app: tauri::AppHandle, state: String) -> Result<(), String> {
    let path = state_path(&app)?;
    // Write-then-rename so a crash mid-write cannot destroy the bookmarks.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, state).map_err(|e| format!("cannot write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("cannot replace {}: {e}", path.display()))
}
