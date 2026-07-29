use serde::Deserialize;
use serde_json::json;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// How the server authenticates against the GitHub API and git.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AuthSettings {
  /// A long-lived personal access token from ATR_GITHUB_TOKEN.
  StaticToken(String),
  /// A GitHub App that mints short-lived installation tokens.
  App { app_id: String, private_key_path: String, installation_id: String },
}

/// Picks the auth mode from the environment values. Exactly one of the two
/// modes must be configured; mixing or partial App settings is an error so
/// misconfiguration fails at boot, not on the first webhook.
pub fn select_auth(
  token: Option<String>,
  app_id: Option<String>,
  private_key_path: Option<String>,
  installation_id: Option<String>,
) -> Result<AuthSettings, String> {
  let app_vars = [&app_id, &private_key_path, &installation_id];
  let app_set = app_vars.iter().filter(|v| v.is_some()).count();
  match (token, app_set) {
    (Some(_), n) if n > 0 => Err(
      "set either ATR_GITHUB_TOKEN or the ATR_GITHUB_APP_* variables, not both".to_string(),
    ),
    (Some(token), _) => Ok(AuthSettings::StaticToken(token)),
    (None, 3) => Ok(AuthSettings::App {
      app_id: app_id.unwrap(),
      private_key_path: private_key_path.unwrap(),
      installation_id: installation_id.unwrap(),
    }),
    (None, 0) => Err(
      "no GitHub credentials: set ATR_GITHUB_TOKEN, or ATR_GITHUB_APP_ID + \
       ATR_GITHUB_APP_PRIVATE_KEY_PATH + ATR_GITHUB_APP_INSTALLATION_ID"
        .to_string(),
    ),
    (None, _) => Err(
      "incomplete GitHub App settings: ATR_GITHUB_APP_ID, ATR_GITHUB_APP_PRIVATE_KEY_PATH \
       and ATR_GITHUB_APP_INSTALLATION_ID must all be set"
        .to_string(),
    ),
  }
}

/// Hands out a GitHub token on demand. In App mode the token is a cached
/// short-lived installation token, re-minted before it expires, so no
/// long-lived credential exists anywhere at runtime.
pub struct TokenProvider {
  mode: ProviderMode,
}

enum ProviderMode {
  Static(String),
  App {
    app_id: String,
    private_key_pem: Vec<u8>,
    installation_id: String,
    api_base: String,
    cache: Mutex<Option<CachedToken>>,
  },
}

struct CachedToken {
  token: String,
  expires_at_epoch: u64,
}

/// Installation tokens live one hour; treat them as expiring earlier so a
/// long terraform run started near the boundary still holds a valid token.
const TOKEN_LIFETIME_SECS: u64 = 3600;
const REFRESH_MARGIN_SECS: u64 = 600;

/// True when the cached token is close enough to expiry to re-mint.
/// Pure so the boundary is testable.
pub fn needs_refresh(expires_at_epoch: u64, now_epoch: u64) -> bool {
  now_epoch + REFRESH_MARGIN_SECS >= expires_at_epoch
}

impl TokenProvider {
  /// Builds the provider, reading the App private key at boot so a bad
  /// path fails immediately.
  pub fn new(settings: &AuthSettings, api_base: &str) -> Result<TokenProvider, String> {
    let mode = match settings {
      AuthSettings::StaticToken(token) => ProviderMode::Static(token.clone()),
      AuthSettings::App { app_id, private_key_path, installation_id } => {
        let private_key_pem = std::fs::read(private_key_path)
          .map_err(|e| format!("cannot read App private key {private_key_path}: {e}"))?;
        jsonwebtoken::EncodingKey::from_rsa_pem(&private_key_pem)
          .map_err(|e| format!("App private key is not a valid RSA PEM: {e}"))?;
        ProviderMode::App {
          app_id: app_id.clone(),
          private_key_pem,
          installation_id: installation_id.clone(),
          api_base: api_base.trim_end_matches('/').to_string(),
          cache: Mutex::new(None),
        }
      }
    };
    Ok(TokenProvider { mode })
  }

  pub fn token(&self) -> Result<String, String> {
    match &self.mode {
      ProviderMode::Static(token) => Ok(token.clone()),
      ProviderMode::App { app_id, private_key_pem, installation_id, api_base, cache } => {
        let now = epoch_now();
        let mut cache = cache.lock().unwrap();
        if let Some(cached) = cache.as_ref() {
          if !needs_refresh(cached.expires_at_epoch, now) {
            return Ok(cached.token.clone());
          }
        }
        let token = mint_installation_token(app_id, private_key_pem, installation_id, api_base, now)?;
        *cache = Some(CachedToken {
          token: token.clone(),
          expires_at_epoch: now + TOKEN_LIFETIME_SECS,
        });
        Ok(token)
      }
    }
  }
}

#[derive(Deserialize)]
struct InstallationTokenResponse {
  token: String,
}

/// Signs a short-lived App JWT (RS256) and exchanges it for an
/// installation access token.
fn mint_installation_token(
  app_id: &str,
  private_key_pem: &[u8],
  installation_id: &str,
  api_base: &str,
  now: u64,
) -> Result<String, String> {
  // GitHub rejects JWTs whose iat is in the future; backdate 60s to absorb
  // clock skew. Max allowed exp is 10 minutes; use 9.
  let claims = json!({ "iat": now - 60, "exp": now + 540, "iss": app_id });
  let key = jsonwebtoken::EncodingKey::from_rsa_pem(private_key_pem)
    .map_err(|e| format!("invalid App private key: {e}"))?;
  let jwt = jsonwebtoken::encode(
    &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
    &claims,
    &key,
  )
  .map_err(|e| format!("failed to sign App JWT: {e}"))?;

  let url = format!("{api_base}/app/installations/{installation_id}/access_tokens");
  let response: InstallationTokenResponse = ureq::post(&url)
    .set("Authorization", &format!("Bearer {jwt}"))
    .set("Accept", "application/vnd.github+json")
    .set("User-Agent", "akbun-terraform-apply-remote")
    .call()
    .map_err(|e| format!("POST {url} failed: {e}"))?
    .into_json()
    .map_err(|e| format!("installation token response invalid: {e}"))?;
  Ok(response.token)
}

fn epoch_now() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn some(s: &str) -> Option<String> {
    Some(s.to_string())
  }

  #[test]
  fn static_token_is_selected() {
    let auth = select_auth(some("tok"), None, None, None).unwrap();
    assert_eq!(auth, AuthSettings::StaticToken("tok".to_string()));
  }

  #[test]
  fn complete_app_settings_are_selected() {
    let auth = select_auth(None, some("123"), some("/key.pem"), some("456")).unwrap();
    assert_eq!(
      auth,
      AuthSettings::App {
        app_id: "123".to_string(),
        private_key_path: "/key.pem".to_string(),
        installation_id: "456".to_string(),
      }
    );
  }

  #[test]
  fn no_credentials_is_an_error() {
    assert!(select_auth(None, None, None, None).is_err());
  }

  #[test]
  fn partial_app_settings_are_an_error() {
    assert!(select_auth(None, some("123"), None, None).is_err());
    assert!(select_auth(None, some("123"), some("/key.pem"), None).is_err());
  }

  #[test]
  fn mixing_token_and_app_is_an_error() {
    assert!(select_auth(some("tok"), some("123"), some("/key.pem"), some("456")).is_err());
  }

  #[test]
  fn refresh_happens_before_expiry_margin() {
    let expires = 10_000;
    assert!(!needs_refresh(expires, expires - REFRESH_MARGIN_SECS - 1));
    assert!(needs_refresh(expires, expires - REFRESH_MARGIN_SECS));
    assert!(needs_refresh(expires, expires + 1));
  }

  #[test]
  fn static_provider_returns_the_token_verbatim() {
    let provider =
      TokenProvider::new(&AuthSettings::StaticToken("tok".to_string()), "https://api.github.com")
        .unwrap();
    assert_eq!(provider.token().unwrap(), "tok");
  }

  #[test]
  fn app_provider_rejects_a_bad_key_at_boot() {
    let dir = std::env::temp_dir().join(format!("atr-auth-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let key_path = dir.join("bad.pem");
    std::fs::write(&key_path, "not a pem").unwrap();
    let settings = AuthSettings::App {
      app_id: "1".to_string(),
      private_key_path: key_path.to_string_lossy().to_string(),
      installation_id: "2".to_string(),
    };
    assert!(TokenProvider::new(&settings, "https://api.github.com").is_err());
    let _ = std::fs::remove_dir_all(dir);
  }
}
