//! AWS profiles, CLI-exported credentials, and read-only AWS view models.
//!
//! Nothing here imports tauri. The app crate wires these functions to
//! commands; this crate is what the pull request job compiles and tests.

pub mod awscli;
pub mod cloudtrail;
pub mod creds;
pub mod ec2;
pub mod error;
pub mod http;
pub mod profiles;

pub use creds::RoleCredentials;
pub use error::CoreError;
pub use profiles::{Profile, SsoConfig};
