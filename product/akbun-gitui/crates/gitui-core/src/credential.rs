use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{GitError, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum CredentialType {
    SshKey {
        private_key_path: PathBuf,
        public_key_path: Option<PathBuf>,
        passphrase: Option<String>,
    },
    Token {
        token: String,
    },
    HttpBasic {
        username: String,
        password: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CredentialConfig {
    pub name: String,
    pub credential_type: CredentialType,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CredentialStore {
    pub credentials: Vec<CredentialConfig>,
    pub active_index: Option<usize>,
}

fn config_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| GitError::Generic("could not determine config directory".to_string()))?;
    Ok(config_dir.join("akbun-gitui").join("credentials.json"))
}

pub fn load_credentials() -> Result<CredentialStore> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(CredentialStore::default());
    }
    let content = fs::read_to_string(&path)?;
    let store: CredentialStore = serde_json::from_str(&content)?;
    Ok(store)
}

pub fn save_credentials(store: &CredentialStore) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(store)?;
    fs::write(&path, content)?;
    Ok(())
}

pub fn list_ssh_keys() -> Result<Vec<PathBuf>> {
    let ssh_dir = dirs::home_dir()
        .ok_or_else(|| GitError::Generic("could not determine home directory".to_string()))?
        .join(".ssh");

    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    for entry in fs::read_dir(&ssh_dir)? {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_public = filename.ends_with(".pub");
        let is_known_hosts = filename.starts_with("known_hosts");
        let is_config = filename == "config" || filename == "authorized_keys";

        if !is_public && !is_known_hosts && !is_config {
            keys.push(path);
        }
    }

    keys.sort();
    Ok(keys)
}

pub fn build_callbacks(config: &CredentialConfig) -> git2::RemoteCallbacks<'_> {
    let mut callbacks = git2::RemoteCallbacks::new();

    match &config.credential_type {
        CredentialType::SshKey {
            private_key_path,
            public_key_path,
            passphrase,
        } => {
            let private_key = private_key_path.clone();
            let public_key = public_key_path.clone();
            let pass = passphrase.clone();

            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                let username = username_from_url.unwrap_or("git");
                git2::Cred::ssh_key(
                    username,
                    public_key.as_deref(),
                    &private_key,
                    pass.as_deref(),
                )
            });
        }
        CredentialType::Token { token } => {
            let token = token.clone();
            callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
                git2::Cred::userpass_plaintext("oauth2", &token)
            });
        }
        CredentialType::HttpBasic { username, password } => {
            let user = username.clone();
            let pass = password.clone();
            callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
                git2::Cred::userpass_plaintext(&user, &pass)
            });
        }
    }

    callbacks
}
