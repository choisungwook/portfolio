//! Parses ~/.aws/config into the profile list the app shows.
//!
//! Only ~/.aws/config is read. ~/.aws/credentials holds long-lived access
//! keys, and this app deliberately does not use them: authentication is IAM
//! Identity Center only.

use serde::Serialize;
use std::collections::HashMap;

/// The scope the AWS CLI registers with when a session declares none.
pub const DEFAULT_SCOPE: &str = "sso:account:access";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub region: Option<String>,
    /// None means the profile has no usable Identity Center configuration.
    /// It is still listed, but login and API calls refuse it with a message.
    pub sso: Option<SsoConfig>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SsoConfig {
    /// Set when the profile points at an [sso-session] section. The token
    /// cache file is keyed by this name; legacy profiles key by start URL.
    pub session_name: Option<String>,
    pub start_url: String,
    pub sso_region: String,
    pub account_id: Option<String>,
    pub role_name: Option<String>,
    pub scopes: Vec<String>,
}

/// Parses the text of an AWS shared config file. Order of appearance is kept.
pub fn parse_config(text: &str) -> Vec<Profile> {
    let sections = split_sections(text);

    let mut sessions: HashMap<&str, &HashMap<String, String>> = HashMap::new();
    for (header, keys) in &sections {
        if let Some(name) = header.strip_prefix("sso-session ") {
            sessions.insert(name.trim(), keys);
        }
    }

    let mut profiles = Vec::new();
    for (header, keys) in &sections {
        let name = if header == "default" {
            "default"
        } else if let Some(rest) = header.strip_prefix("profile ") {
            rest.trim()
        } else {
            continue;
        };
        profiles.push(Profile {
            name: name.to_string(),
            region: keys.get("region").cloned(),
            sso: resolve_sso(keys, &sessions),
        });
    }
    profiles
}

/// Splits an INI-ish file into (section header, key map) in file order.
/// Indented lines are nested values (the s3 block style); nothing here needs
/// them, so they are skipped rather than mis-read as top-level keys.
fn split_sections(text: &str) -> Vec<(String, HashMap<String, String>)> {
    let mut sections: Vec<(String, HashMap<String, String>)> = Vec::new();
    for raw in text.lines() {
        if raw.starts_with(char::is_whitespace) {
            continue;
        }
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let header = line[1..line.len() - 1].trim().to_string();
            sections.push((header, HashMap::new()));
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if let Some((_, keys)) = sections.last_mut() {
            keys.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    sections
}

fn resolve_sso(
    keys: &HashMap<String, String>,
    sessions: &HashMap<&str, &HashMap<String, String>>,
) -> Option<SsoConfig> {
    let account_id = keys.get("sso_account_id").cloned();
    let role_name = keys.get("sso_role_name").cloned();

    if let Some(session_name) = keys.get("sso_session") {
        let session = sessions.get(session_name.as_str())?;
        return Some(SsoConfig {
            session_name: Some(session_name.clone()),
            start_url: session.get("sso_start_url")?.clone(),
            sso_region: session.get("sso_region")?.clone(),
            account_id,
            role_name,
            scopes: parse_scopes(session.get("sso_registration_scopes")),
        });
    }

    // Legacy style: the sso_* keys sit directly on the profile.
    Some(SsoConfig {
        session_name: None,
        start_url: keys.get("sso_start_url")?.clone(),
        sso_region: keys.get("sso_region")?.clone(),
        account_id,
        role_name,
        scopes: vec![DEFAULT_SCOPE.to_string()],
    })
}

fn parse_scopes(raw: Option<&String>) -> Vec<String> {
    let scopes: Vec<String> = raw
        .map(|s| {
            s.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if scopes.is_empty() {
        vec![DEFAULT_SCOPE.to_string()]
    } else {
        scopes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
# comment
[default]
region = us-east-1

[profile dev]
sso_session = my-sso
sso_account_id = 123456789012
sso_role_name = ReadOnly
region = ap-northeast-2

[sso-session my-sso]
sso_start_url = https://d-90000000.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access, custom:scope

[profile legacy]
sso_start_url = https://d-90000000.awsapps.com/start
sso_region = us-east-1
sso_account_id = 111122223333
sso_role_name = Admin
region = us-west-2

[profile keys-only]
region = eu-west-1

[profile broken-session]
sso_session = missing
"#;

    #[test]
    fn parses_profiles_in_order() {
        let profiles = parse_config(SAMPLE);
        let names: Vec<&str> = profiles.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["default", "dev", "legacy", "keys-only", "broken-session"]
        );
    }

    #[test]
    fn resolves_sso_session_reference() {
        let profiles = parse_config(SAMPLE);
        let dev = profiles.iter().find(|p| p.name == "dev").unwrap();
        let sso = dev.sso.as_ref().unwrap();
        assert_eq!(sso.session_name.as_deref(), Some("my-sso"));
        assert_eq!(sso.start_url, "https://d-90000000.awsapps.com/start");
        assert_eq!(sso.sso_region, "us-east-1");
        assert_eq!(sso.account_id.as_deref(), Some("123456789012"));
        assert_eq!(sso.role_name.as_deref(), Some("ReadOnly"));
        assert_eq!(sso.scopes, vec!["sso:account:access", "custom:scope"]);
        assert_eq!(dev.region.as_deref(), Some("ap-northeast-2"));
    }

    #[test]
    fn resolves_legacy_inline_sso() {
        let profiles = parse_config(SAMPLE);
        let legacy = profiles.iter().find(|p| p.name == "legacy").unwrap();
        let sso = legacy.sso.as_ref().unwrap();
        assert_eq!(sso.session_name, None);
        assert_eq!(sso.scopes, vec![DEFAULT_SCOPE]);
        assert_eq!(sso.role_name.as_deref(), Some("Admin"));
    }

    #[test]
    fn profile_without_sso_is_listed_but_unmarked() {
        let profiles = parse_config(SAMPLE);
        assert!(profiles.iter().find(|p| p.name == "keys-only").unwrap().sso.is_none());
        assert!(profiles
            .iter()
            .find(|p| p.name == "broken-session")
            .unwrap()
            .sso
            .is_none());
    }
}
