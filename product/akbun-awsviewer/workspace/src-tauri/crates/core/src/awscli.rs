//! AWS CLI argument and output handling.

use crate::{CoreError, RoleCredentials};
use serde::Deserialize;

pub fn export_credentials_args(profile: &str) -> Vec<String> {
    vec![
        "configure".to_string(),
        "export-credentials".to_string(),
        "--profile".to_string(),
        profile.to_string(),
        "--format".to_string(),
        "process".to_string(),
    ]
}

pub const CLI_CANDIDATES: [&str; 3] = [
    "/usr/local/bin/aws",
    "/opt/homebrew/bin/aws",
    "/usr/bin/aws",
];

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ExportedCredentials {
    access_key_id: String,
    secret_access_key: String,
    session_token: Option<String>,
}

pub fn parse_exported_credentials(text: &str) -> Result<RoleCredentials, CoreError> {
    let exported: ExportedCredentials =
        serde_json::from_str(text).map_err(|error| CoreError::Aws {
            message: format!("AWS CLI returned invalid credentials: {error}"),
        })?;
    if exported.access_key_id.is_empty() || exported.secret_access_key.is_empty() {
        return Err(CoreError::Aws {
            message: "AWS CLI returned incomplete credentials".to_string(),
        });
    }
    Ok(RoleCredentials {
        access_key_id: exported.access_key_id,
        secret_access_key: exported.secret_access_key,
        session_token: exported.session_token,
    })
}

pub fn error_tail(output: &str, lines: usize) -> String {
    let kept: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let start = kept.len().saturating_sub(lines);
    kept[start..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_args_pin_the_profile_and_process_format() {
        assert_eq!(
            export_credentials_args("prod"),
            vec![
                "configure",
                "export-credentials",
                "--profile",
                "prod",
                "--format",
                "process"
            ]
        );
    }

    #[test]
    fn parses_process_credentials_with_session_token() {
        let text = r#"{"Version":1,"AccessKeyId":"ASIAEXAMPLE","SecretAccessKey":"secret","SessionToken":"token","Expiration":"2026-08-12T12:00:00Z"}"#;
        let credentials = parse_exported_credentials(text).unwrap();
        assert_eq!(credentials.access_key_id, "ASIAEXAMPLE");
        assert_eq!(credentials.secret_access_key, "secret");
        assert_eq!(credentials.session_token.as_deref(), Some("token"));
    }

    #[test]
    fn error_tail_keeps_the_last_nonempty_lines() {
        assert_eq!(error_tail("one\n\ntwo\nthree\n", 2), "two\nthree");
    }
}
