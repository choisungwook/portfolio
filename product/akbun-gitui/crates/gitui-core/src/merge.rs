use git2::{BranchType, MergeOptions, Repository};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum MergeResult {
    FastForward,
    Normal,
    Conflict(Vec<String>),
}

pub fn merge_branch(repo: &Repository, branch_name: &str) -> Result<MergeResult> {
    let branch = repo.find_branch(branch_name, BranchType::Local)?;
    let reference = branch.into_reference();
    let annotated_commit = repo.reference_to_annotated_commit(&reference)?;

    let (analysis, _preference) = repo.merge_analysis(&[&annotated_commit])?;

    if analysis.is_up_to_date() {
        return Ok(MergeResult::Normal);
    }

    if analysis.is_fast_forward() {
        let target_oid = annotated_commit.id();
        let target_commit = repo.find_commit(target_oid)?;
        let mut head_ref = repo.head()?;
        head_ref.set_target(target_oid, "fast-forward merge")?;
        repo.checkout_tree(target_commit.as_object(), None)?;
        return Ok(MergeResult::FastForward);
    }

    let mut merge_opts = MergeOptions::new();
    repo.merge(&[&annotated_commit], Some(&mut merge_opts), None)?;

    let index = repo.index()?;
    if index.has_conflicts() {
        let mut conflicts = Vec::new();
        for conflict in index.conflicts()? {
            let conflict = conflict?;
            if let Some(our) = conflict.our {
                let path = String::from_utf8_lossy(&our.path).to_string();
                conflicts.push(path);
            }
        }
        return Ok(MergeResult::Conflict(conflicts));
    }

    let signature = repo.signature()?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let their_commit = repo.find_commit(annotated_commit.id())?;

    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let message = format!("Merge branch '{}'", branch_name);
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &[&head_commit, &their_commit],
    )?;

    repo.cleanup_state()?;

    Ok(MergeResult::Normal)
}

pub fn abort_merge(repo: &Repository) -> Result<()> {
    let head_commit = repo.head()?.peel_to_commit()?;
    let head_object = head_commit.as_object();

    repo.reset(head_object, git2::ResetType::Hard, None)?;
    repo.cleanup_state()?;

    Ok(())
}
