use std::path::Path;

use git2::Repository;
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub name: String,
    pub current_branch: Option<String>,
    pub is_bare: bool,
    pub workdir: Option<String>,
}

pub fn open_repo(path: &Path) -> Result<Repository> {
    let repo = Repository::discover(path)?;
    Ok(repo)
}

pub fn repo_info(repo: &Repository) -> Result<RepoInfo> {
    let name = repo
        .workdir()
        .or_else(|| repo.path().parent())
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let current_branch = match repo.head() {
        Ok(head) => head.shorthand().map(|s| s.to_string()),
        Err(_) => None,
    };

    let workdir = repo.workdir().map(|p| p.to_string_lossy().to_string());

    Ok(RepoInfo {
        name,
        current_branch,
        is_bare: repo.is_bare(),
        workdir,
    })
}
