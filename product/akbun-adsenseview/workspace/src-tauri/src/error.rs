//! One error shape for every command, so the page can tell "sign in again"
//! from "quota exhausted" without parsing messages.

use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ErrorKind {
  /// No usable token: never signed in, refresh token revoked, or expired.
  Auth,
  /// The API answered 429 or a 403 that names a quota.
  Quota,
  /// client_secret.json missing or unreadable.
  Setup,
  Other,
}

#[derive(Clone, Debug, Serialize)]
pub struct AppError {
  pub kind: ErrorKind,
  pub message: String,
}

impl AppError {
  pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
    AppError { kind, message: message.into() }
  }

  pub fn other(message: impl Into<String>) -> Self {
    Self::new(ErrorKind::Other, message)
  }
}

impl From<reqwest::Error> for AppError {
  fn from(error: reqwest::Error) -> Self {
    AppError::other(format!("network: {error}"))
  }
}

impl From<rusqlite::Error> for AppError {
  fn from(error: rusqlite::Error) -> Self {
    AppError::other(format!("cache: {error}"))
  }
}

impl From<std::io::Error> for AppError {
  fn from(error: std::io::Error) -> Self {
    AppError::other(format!("io: {error}"))
  }
}
