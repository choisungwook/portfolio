//! The AWS side of akbun-awsviewer: profiles from ~/.aws/config, IAM Identity
//! Center sessions, and the read-only EC2 view model.
//!
//! Nothing here imports tauri. The app crate wires these functions to
//! commands; this crate is what the pull request job compiles and tests.

pub mod creds;
pub mod ec2;
pub mod error;
pub mod http;
pub mod login;
pub mod profiles;
pub mod ssocache;

pub use creds::RoleCredentials;
pub use error::CoreError;
pub use profiles::{Profile, SsoConfig};
pub use ssocache::CachedToken;
