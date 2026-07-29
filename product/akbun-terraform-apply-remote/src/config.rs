use std::env;

/// Runtime configuration loaded from environment variables.
#[derive(Clone, Debug)]
pub struct Config {
  pub github_token: String,
  pub webhook_secret: String,
  pub port: u16,
  pub trigger: String,
  pub terraform_bin: String,
  pub data_dir: String,
  pub github_api: String,
}

impl Config {
  pub fn from_env() -> Result<Config, String> {
    let github_token =
      env::var("ATR_GITHUB_TOKEN").map_err(|_| "ATR_GITHUB_TOKEN is required".to_string())?;
    let webhook_secret =
      env::var("ATR_WEBHOOK_SECRET").map_err(|_| "ATR_WEBHOOK_SECRET is required".to_string())?;
    let port = env::var("ATR_PORT")
      .unwrap_or_else(|_| "4141".to_string())
      .parse::<u16>()
      .map_err(|_| "ATR_PORT must be a port number".to_string())?;
    Ok(Config {
      github_token,
      webhook_secret,
      port,
      trigger: env::var("ATR_TRIGGER").unwrap_or_else(|_| "akbun".to_string()),
      terraform_bin: env::var("ATR_TERRAFORM_BIN").unwrap_or_else(|_| "terraform".to_string()),
      data_dir: env::var("ATR_DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
      github_api: env::var("ATR_GITHUB_API")
        .unwrap_or_else(|_| "https://api.github.com".to_string()),
    })
  }
}
