//! Resolves credentials through the installed AWS CLI.

use awsviewer_core::awscli;
use awsviewer_core::{CoreError, RoleCredentials};
use std::process::{Command, Stdio};

pub fn load_credentials(profile: &str) -> Result<RoleCredentials, CoreError> {
    let binary = resolve_cli()?;
    let output = Command::new(&binary)
        .args(awscli::export_credentials_args(profile))
        .stdin(Stdio::null())
        .output()
        .map_err(|error| CoreError::Io {
            message: format!("cannot run {binary}: {error}"),
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = awscli::error_tail(&stderr, 4);
        let suffix = if detail.is_empty() {
            String::new()
        } else {
            format!(" AWS CLI: {detail}")
        };
        return Err(CoreError::LoginRequired {
            message: format!(
                "No valid AWS CLI session for profile {profile}. Run `aws login --profile {profile}` in a terminal.{suffix}"
            ),
        });
    }
    let stdout = String::from_utf8(output.stdout).map_err(|error| CoreError::Aws {
        message: format!("AWS CLI returned non-UTF-8 credentials: {error}"),
    })?;
    awscli::parse_exported_credentials(&stdout)
}

fn resolve_cli() -> Result<String, CoreError> {
    for candidate in awscli::CLI_CANDIDATES {
        if std::path::Path::new(candidate).is_file() {
            return Ok(candidate.to_string());
        }
    }
    if which_in_path("aws").is_some() {
        return Ok("aws".to_string());
    }
    Err(CoreError::Io {
        message: format!(
            "the AWS CLI was not found in {} or on PATH; install AWS CLI v2 and try again",
            awscli::CLI_CANDIDATES.join(", ")
        ),
    })
}

fn which_in_path(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}
