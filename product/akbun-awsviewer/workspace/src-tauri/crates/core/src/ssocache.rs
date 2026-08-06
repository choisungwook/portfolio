//! The Identity Center token cache under ~/.aws/sso/cache.
//!
//! The file format and naming follow the AWS CLI, so a session made with
//! `aws sso login` is picked up here and a login made here is picked up by
//! the CLI. Session-style configs key the file by sha1 of the session name,
//! legacy configs by sha1 of the start URL.

use crate::profiles::SsoConfig;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Tokens this close to expiry are treated as expired. Refreshing a minute
/// early beats an API call failing mid-flight.
const EXPIRY_SKEW_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CachedToken {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    pub access_token: String,
    /// RFC3339 UTC, e.g. 2026-08-06T12:00:00Z.
    pub expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registration_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

pub fn cache_key(sso: &SsoConfig) -> String {
    let raw = sso.session_name.as_deref().unwrap_or(&sso.start_url);
    let digest = Sha1::digest(raw.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn cache_path(home: &Path, sso: &SsoConfig) -> PathBuf {
    home.join(".aws")
        .join("sso")
        .join("cache")
        .join(format!("{}.json", cache_key(sso)))
}

/// None for a missing or unreadable file; a broken cache file is the same as
/// not being logged in.
pub fn load_token(path: &Path) -> Option<CachedToken> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_token(path: &Path, token: &CachedToken) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(token)?;
    std::fs::write(path, text)
}

/// Seconds until the token expires; negative when already expired, None when
/// the timestamp cannot be parsed.
pub fn expires_in_secs(token: &CachedToken) -> Option<i64> {
    let expires = aws_smithy_types::DateTime::from_str(
        &token.expires_at,
        aws_smithy_types::date_time::Format::DateTime,
    )
    .ok()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some(expires.secs() - now)
}

pub fn is_valid(token: &CachedToken) -> bool {
    matches!(expires_in_secs(token), Some(secs) if secs > EXPIRY_SKEW_SECS)
}

/// Formats a unix timestamp the way the AWS CLI writes expiresAt.
pub fn format_epoch(secs: i64) -> String {
    aws_smithy_types::DateTime::from_secs(secs)
        .fmt(aws_smithy_types::date_time::Format::DateTime)
        .expect("whole-second epoch formats losslessly")
}

pub fn now_epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::SsoConfig;

    fn sso(session_name: Option<&str>) -> SsoConfig {
        SsoConfig {
            session_name: session_name.map(str::to_string),
            start_url: "https://d-90000000.awsapps.com/start".to_string(),
            sso_region: "us-east-1".to_string(),
            account_id: None,
            role_name: None,
            scopes: vec![],
        }
    }

    fn token(expires_at: &str) -> CachedToken {
        CachedToken {
            start_url: None,
            region: None,
            access_token: "tok".to_string(),
            expires_at: expires_at.to_string(),
            client_id: None,
            client_secret: None,
            registration_expires_at: None,
            refresh_token: None,
        }
    }

    // Expected values are sha1sum output over the same strings, so a change
    // here is a change in which cache file the AWS CLI would read.
    #[test]
    fn session_name_keys_the_cache() {
        assert_eq!(
            cache_key(&sso(Some("my-sso"))),
            "0ad374308c5a4e22f723adf10145eafad7c4031c"
        );
    }

    #[test]
    fn legacy_profile_keys_by_start_url() {
        assert_eq!(
            cache_key(&sso(None)),
            "d781526c33525feff13c92123073aeffecb5b19b"
        );
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = cache_path(dir.path(), &sso(Some("my-sso")));
        let original = token("2030-01-01T00:00:00Z");
        save_token(&path, &original).unwrap();
        assert_eq!(load_token(&path), Some(original));
    }

    #[test]
    fn missing_or_broken_cache_reads_as_logged_out() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nope.json");
        assert_eq!(load_token(&path), None);
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(load_token(&path), None);
    }

    #[test]
    fn expiry_honors_the_skew() {
        assert!(is_valid(&token(&format_epoch(now_epoch_secs() + 3600))));
        assert!(!is_valid(&token(&format_epoch(now_epoch_secs() + 30))));
        assert!(!is_valid(&token("2020-01-01T00:00:00Z")));
        assert!(!is_valid(&token("garbage")));
    }

    #[test]
    fn format_epoch_matches_cli_style() {
        assert_eq!(format_epoch(1786320000), "2026-08-10T00:00:00Z");
    }
}
