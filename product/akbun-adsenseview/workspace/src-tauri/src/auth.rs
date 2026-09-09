//! OAuth 2.0 for an installed app: a browser sign-in that comes back to a
//! loopback port, then refresh tokens for every later start.

use crate::error::{AppError, ErrorKind};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const SCOPE: &str = "https://www.googleapis.com/auth/adsense.readonly";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Deserialize)]
pub struct ClientSecret {
  pub client_id: String,
  pub client_secret: String,
}

#[derive(Deserialize)]
struct ClientSecretFile {
  installed: Option<ClientSecret>,
  web: Option<ClientSecret>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Token {
  pub access_token: String,
  pub refresh_token: String,
  pub expires_at: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
  access_token: String,
  expires_in: u64,
  refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
  error: String,
  error_description: Option<String>,
}

fn now() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn token_path(dir: &Path) -> PathBuf {
  dir.join("token.json")
}

pub fn load_client_secret(dir: &Path) -> Result<ClientSecret, AppError> {
  let path = dir.join("client_secret.json");
  let text = std::fs::read_to_string(&path)
    .map_err(|_| AppError::new(ErrorKind::Setup, format!("put client_secret.json in {}", dir.display())))?;
  let file: ClientSecretFile = serde_json::from_str(&text)
    .map_err(|error| AppError::new(ErrorKind::Setup, format!("client_secret.json: {error}")))?;
  file
    .installed
    .or(file.web)
    .ok_or_else(|| AppError::new(ErrorKind::Setup, "client_secret.json has no installed or web section"))
}

pub fn has_client_secret(dir: &Path) -> bool {
  dir.join("client_secret.json").is_file()
}

pub fn load_token(dir: &Path) -> Option<Token> {
  let text = std::fs::read_to_string(token_path(dir)).ok()?;
  serde_json::from_str(&text).ok()
}

fn save_token(dir: &Path, token: &Token) -> Result<(), AppError> {
  let text = serde_json::to_string_pretty(token).map_err(|error| AppError::other(error.to_string()))?;
  std::fs::write(token_path(dir), text)?;
  Ok(())
}

pub fn sign_out(dir: &Path) {
  let _ = std::fs::remove_file(token_path(dir));
}

/// A random value Google echoes back, so a redirect that did not start here
/// is rejected.
fn random_state() -> Result<String, AppError> {
  let mut bytes = [0u8; 16];
  getrandom::fill(&mut bytes).map_err(|error| AppError::other(format!("random: {error}")))?;
  Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Open the consent page and wait for Google to redirect back with a code.
/// Returns the URL to open and a blocking waiter, so the caller can open the
/// browser from Tauri and wait off the main thread.
pub fn start_sign_in(client: &ClientSecret) -> Result<(String, TcpListener, String), AppError> {
  let listener = TcpListener::bind("127.0.0.1:0")?;
  let port = listener.local_addr()?.port();
  let state = random_state()?;
  let redirect = format!("http://127.0.0.1:{port}");
  let mut url = url::Url::parse(AUTH_URL).map_err(|error| AppError::other(error.to_string()))?;
  url.query_pairs_mut()
    .append_pair("client_id", &client.client_id)
    .append_pair("redirect_uri", &redirect)
    .append_pair("response_type", "code")
    .append_pair("scope", SCOPE)
    .append_pair("access_type", "offline")
    .append_pair("prompt", "consent")
    .append_pair("state", &state);
  Ok((url.to_string(), listener, state))
}

/// Block until the browser hits the loopback port, then answer it with a
/// small page. Only the first request is read; the browser's favicon request
/// is ignored because the listener is dropped right after.
pub fn wait_for_code(listener: TcpListener, expected_state: &str) -> Result<(String, String), AppError> {
  listener.set_nonblocking(true)?;
  let deadline = Instant::now() + SIGN_IN_TIMEOUT;
  let redirect = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
  loop {
    match listener.accept() {
      Ok((mut stream, _)) => {
        stream.set_nonblocking(false)?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..n]);
        let result = parse_code(&request, expected_state);
        let body = match &result {
          Ok(_) => "Signed in. You can close this tab and go back to akbun-adsenseview.",
          Err(error) => &error.message,
        };
        let response = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          body.len(),
          body
        );
        let _ = stream.write_all(response.as_bytes());
        return result.map(|code| (code, redirect));
      }
      Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
        if Instant::now() > deadline {
          return Err(AppError::new(ErrorKind::Auth, "sign-in timed out"));
        }
        std::thread::sleep(Duration::from_millis(200));
      }
      Err(error) => return Err(error.into()),
    }
  }
}

fn parse_code(request: &str, expected_state: &str) -> Result<String, AppError> {
  let target = request
    .lines()
    .next()
    .and_then(|line| line.split_whitespace().nth(1))
    .ok_or_else(|| AppError::new(ErrorKind::Auth, "bad redirect request"))?;
  let url = url::Url::parse(&format!("http://localhost{target}"))
    .map_err(|_| AppError::new(ErrorKind::Auth, "bad redirect url"))?;
  let mut code = None;
  let mut state = None;
  for (key, value) in url.query_pairs() {
    match key.as_ref() {
      "code" => code = Some(value.into_owned()),
      "state" => state = Some(value.into_owned()),
      "error" => return Err(AppError::new(ErrorKind::Auth, format!("google refused: {value}"))),
      _ => {}
    }
  }
  if state.as_deref() != Some(expected_state) {
    return Err(AppError::new(ErrorKind::Auth, "state mismatch, try signing in again"));
  }
  code.ok_or_else(|| AppError::new(ErrorKind::Auth, "no code in redirect"))
}

async fn post_token(http: &reqwest::Client, form: &[(&str, &str)]) -> Result<TokenResponse, AppError> {
  let response = http.post(TOKEN_URL).form(form).send().await?;
  if response.status().is_success() {
    return Ok(response.json().await?);
  }
  let status = response.status();
  let text = response.text().await.unwrap_or_default();
  let detail = serde_json::from_str::<TokenError>(&text)
    .map(|e| format!("{}: {}", e.error, e.error_description.unwrap_or_default()))
    .unwrap_or(text);
  Err(AppError::new(ErrorKind::Auth, format!("token endpoint {status}: {detail}")))
}

pub async fn exchange_code(
  http: &reqwest::Client,
  dir: &Path,
  client: &ClientSecret,
  code: &str,
  redirect: &str,
) -> Result<Token, AppError> {
  let response = post_token(
    http,
    &[
      ("code", code),
      ("client_id", &client.client_id),
      ("client_secret", &client.client_secret),
      ("redirect_uri", redirect),
      ("grant_type", "authorization_code"),
    ],
  )
  .await?;
  let refresh_token = response
    .refresh_token
    .ok_or_else(|| AppError::new(ErrorKind::Auth, "google returned no refresh token, sign in again"))?;
  let token = Token {
    access_token: response.access_token,
    refresh_token,
    expires_at: now() + response.expires_in,
  };
  save_token(dir, &token)?;
  Ok(token)
}

/// A valid access token, refreshed when it is about to expire.
pub async fn access_token(http: &reqwest::Client, dir: &Path) -> Result<String, AppError> {
  let token = load_token(dir).ok_or_else(|| AppError::new(ErrorKind::Auth, "not signed in"))?;
  if token.expires_at > now() + 60 {
    return Ok(token.access_token);
  }
  let client = load_client_secret(dir)?;
  let response = post_token(
    http,
    &[
      ("client_id", &client.client_id),
      ("client_secret", &client.client_secret),
      ("refresh_token", &token.refresh_token),
      ("grant_type", "refresh_token"),
    ],
  )
  .await?;
  let refreshed = Token {
    access_token: response.access_token,
    refresh_token: response.refresh_token.unwrap_or(token.refresh_token),
    expires_at: now() + response.expires_in,
  };
  save_token(dir, &refreshed)?;
  Ok(refreshed.access_token)
}
