pub mod branch;
pub mod commit;
pub mod credential;
pub mod diff;
pub mod error;
pub mod log;
pub mod merge;
pub mod rebase;
pub mod repo;
pub mod status;

pub use error::{GitError, Result};
pub use repo::{open_repo, repo_info, RepoInfo};
