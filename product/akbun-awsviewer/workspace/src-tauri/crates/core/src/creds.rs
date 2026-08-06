//! Exchanges a cached Identity Center token for short-lived role credentials.

use crate::error::{aws_error, CoreError};
use crate::profiles::SsoConfig;

#[derive(Debug, Clone)]
pub struct RoleCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
    pub expires_at_epoch_ms: i64,
}

pub async fn fetch_role_credentials(
    sso: &SsoConfig,
    access_token: &str,
    insecure: bool,
) -> Result<RoleCredentials, CoreError> {
    let account_id = sso.account_id.as_ref().ok_or_else(|| CoreError::NoSso {
        message: "profile has no sso_account_id".to_string(),
    })?;
    let role_name = sso.role_name.as_ref().ok_or_else(|| CoreError::NoSso {
        message: "profile has no sso_role_name".to_string(),
    })?;

    let mut builder = aws_sdk_sso::Config::builder()
        .behavior_version(aws_sdk_sso::config::BehaviorVersion::latest())
        .region(aws_sdk_sso::config::Region::new(sso.sso_region.clone()));
    if insecure {
        builder = builder.http_client(crate::http::insecure_http_client());
    }
    let client = aws_sdk_sso::Client::from_conf(builder.build());

    let output = client
        .get_role_credentials()
        .account_id(account_id)
        .role_name(role_name)
        .access_token(access_token)
        .send()
        .await
        .map_err(|err| {
            // The portal rejecting the token means the cached session is
            // stale: surface it as a login prompt, not as an AWS error dump.
            let unauthorized = err
                .as_service_error()
                .map(|svc| svc.is_unauthorized_exception())
                .unwrap_or(false);
            if unauthorized {
                CoreError::LoginRequired {
                    message: "the identity center session was rejected; log in again".to_string(),
                }
            } else {
                aws_error(err)
            }
        })?;

    let creds = output.role_credentials().ok_or_else(|| CoreError::Aws {
        message: "get_role_credentials returned no credentials".to_string(),
    })?;
    Ok(RoleCredentials {
        access_key_id: required(creds.access_key_id(), "accessKeyId")?,
        secret_access_key: required(creds.secret_access_key(), "secretAccessKey")?,
        session_token: required(creds.session_token(), "sessionToken")?,
        expires_at_epoch_ms: creds.expiration(),
    })
}

fn required(value: Option<&str>, field: &str) -> Result<String, CoreError> {
    value.map(str::to_string).ok_or_else(|| CoreError::Aws {
        message: format!("role credentials are missing {field}"),
    })
}
