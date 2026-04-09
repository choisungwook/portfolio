use git2::{BranchType, Oid, Repository};
use serde::{Deserialize, Serialize};

use crate::error::{GitError, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub commit_id: String,
}

pub fn list_branches(repo: &Repository) -> Result<Vec<BranchInfo>> {
    let mut branches = Vec::new();

    for branch_result in repo.branches(None)? {
        let (branch, branch_type) = branch_result?;
        let name = branch.name()?.unwrap_or("").to_string();
        let is_head = branch.is_head();
        let is_remote = branch_type == BranchType::Remote;

        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

        let commit_id = branch
            .get()
            .peel_to_commit()
            .map(|c| c.id().to_string())
            .unwrap_or_default();

        branches.push(BranchInfo {
            name,
            is_head,
            is_remote,
            upstream,
            commit_id,
        });
    }

    Ok(branches)
}

pub fn create_branch(repo: &Repository, name: &str, target_oid: &str) -> Result<()> {
    let oid = Oid::from_str(target_oid).map_err(|e| GitError::Git(e))?;
    let commit = repo.find_commit(oid)?;
    repo.branch(name, &commit, false)?;
    Ok(())
}

pub fn delete_branch(repo: &Repository, name: &str) -> Result<()> {
    let mut branch = repo.find_branch(name, BranchType::Local)?;
    branch.delete()?;
    Ok(())
}

pub fn checkout_branch(repo: &Repository, name: &str) -> Result<()> {
    let branch = repo.find_branch(name, BranchType::Local)?;
    let reference = branch.into_reference();
    let tree = reference.peel_to_tree()?;

    repo.checkout_tree(tree.as_object(), None)?;
    let refname = reference
        .name()
        .ok_or_else(|| GitError::Generic("invalid branch reference name".to_string()))?;
    repo.set_head(refname)?;

    Ok(())
}
