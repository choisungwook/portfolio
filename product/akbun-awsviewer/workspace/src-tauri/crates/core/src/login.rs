//! The IAM Identity Center device authorization flow.
//!
//! Two halves, split so the app can put the browser-interactive step in its
//! own window between them: `request_device_authorization` returns the URL to
//! show, `wait_for_token` polls until the user approves there. Both talk to
//! SSO OIDC, whose register/authorize/token calls are unsigned by design —
//! this is how a client without credentials obtains its first token.

use crate::error::{aws_error, CoreError};
use crate::profiles::SsoConfig;
use crate::ssocache::{format_epoch, now_epoch_secs, CachedToken};
use std::time::Duration;

const CLIENT_NAME: &str = "akbun-awsviewer";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct DeviceAuthorization {
    pub user_code: String,
    pub verification_uri_complete: String,
    pub device_code: String,
    pub interval: Duration,
    pub expires_in: Duration,
    pub client_id: String,
    pub client_secret: String,
    pub registration_expires_at_epoch: Option<i64>,
}

fn ssooidc_client(sso: &SsoConfig, insecure: bool) -> aws_sdk_ssooidc::Client {
    let mut builder = aws_sdk_ssooidc::Config::builder()
        .behavior_version(aws_sdk_ssooidc::config::BehaviorVersion::latest())
        .region(aws_sdk_ssooidc::config::Region::new(sso.sso_region.clone()));
    if insecure {
        builder = builder.http_client(crate::http::insecure_http_client());
    }
    aws_sdk_ssooidc::Client::from_conf(builder.build())
}

pub async fn request_device_authorization(
    sso: &SsoConfig,
    insecure: bool,
) -> Result<DeviceAuthorization, CoreError> {
    let client = ssooidc_client(sso, insecure);

    let registration = client
        .register_client()
        .client_name(CLIENT_NAME)
        .client_type("public")
        .set_scopes(Some(sso.scopes.clone()))
        .send()
        .await
        .map_err(aws_error)?;
    let client_id = registration
        .client_id()
        .ok_or_else(|| missing("clientId"))?
        .to_string();
    let client_secret = registration
        .client_secret()
        .ok_or_else(|| missing("clientSecret"))?
        .to_string();

    let auth = client
        .start_device_authorization()
        .client_id(&client_id)
        .client_secret(&client_secret)
        .start_url(&sso.start_url)
        .send()
        .await
        .map_err(aws_error)?;

    Ok(DeviceAuthorization {
        user_code: auth.user_code().ok_or_else(|| missing("userCode"))?.to_string(),
        verification_uri_complete: auth
            .verification_uri_complete()
            .ok_or_else(|| missing("verificationUriComplete"))?
            .to_string(),
        device_code: auth
            .device_code()
            .ok_or_else(|| missing("deviceCode"))?
            .to_string(),
        interval: poll_interval(auth.interval()),
        expires_in: Duration::from_secs(auth.expires_in().max(0) as u64),
        client_id,
        client_secret,
        registration_expires_at_epoch: Some(registration.client_secret_expires_at())
            .filter(|&s| s > 0),
    })
}

/// Polls the token endpoint until the user approves in the login window.
/// `keep_waiting` is checked before every poll; the app returns false there
/// once the window is closed, which cancels the flow.
pub async fn wait_for_token(
    sso: &SsoConfig,
    auth: &DeviceAuthorization,
    insecure: bool,
    keep_waiting: impl Fn() -> bool + Send,
) -> Result<CachedToken, CoreError> {
    let client = ssooidc_client(sso, insecure);
    let deadline = std::time::Instant::now() + auth.expires_in;
    let mut interval = auth.interval;

    loop {
        if !keep_waiting() {
            return Err(CoreError::Cancelled {
                message: "login window was closed before approval".to_string(),
            });
        }
        if std::time::Instant::now() >= deadline {
            return Err(CoreError::Aws {
                message: "device authorization expired before approval".to_string(),
            });
        }

        match client
            .create_token()
            .client_id(&auth.client_id)
            .client_secret(&auth.client_secret)
            .grant_type(DEVICE_GRANT)
            .device_code(&auth.device_code)
            .send()
            .await
        {
            Ok(token) => {
                let access_token = token
                    .access_token()
                    .ok_or_else(|| missing("accessToken"))?
                    .to_string();
                return Ok(CachedToken {
                    start_url: Some(sso.start_url.clone()),
                    region: Some(sso.sso_region.clone()),
                    access_token,
                    expires_at: format_epoch(now_epoch_secs() + i64::from(token.expires_in())),
                    client_id: Some(auth.client_id.clone()),
                    client_secret: Some(auth.client_secret.clone()),
                    registration_expires_at: auth
                        .registration_expires_at_epoch
                        .map(format_epoch),
                    refresh_token: token.refresh_token().map(str::to_string),
                });
            }
            Err(err) => {
                // Pending means the user has not approved yet; slow down is
                // the server asking for a longer gap. Everything else ends
                // the flow.
                let (pending, slow_down) = match err.as_service_error() {
                    Some(svc) => (
                        svc.is_authorization_pending_exception(),
                        svc.is_slow_down_exception(),
                    ),
                    None => (false, false),
                };
                if slow_down {
                    interval += DEFAULT_POLL_INTERVAL;
                } else if !pending {
                    return Err(aws_error(err));
                }
                tokio::time::sleep(interval).await;
            }
        }
    }
}

fn poll_interval(secs: i32) -> Duration {
    if secs > 0 {
        Duration::from_secs(secs as u64)
    } else {
        DEFAULT_POLL_INTERVAL
    }
}

fn missing(field: &str) -> CoreError {
    CoreError::Aws {
        message: format!("identity center response is missing {field}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poll_interval_defaults_when_server_sends_none() {
        assert_eq!(poll_interval(0), DEFAULT_POLL_INTERVAL);
        assert_eq!(poll_interval(-1), DEFAULT_POLL_INTERVAL);
        assert_eq!(poll_interval(2), Duration::from_secs(2));
    }
}
