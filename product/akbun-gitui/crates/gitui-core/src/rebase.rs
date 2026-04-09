use git2::{BranchType, RebaseOptions, Repository};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RebaseStep {
    pub oid: String,
    pub message: String,
}

pub fn start_rebase(repo: &Repository, onto_branch: &str) -> Result<Vec<RebaseStep>> {
    let branch = repo.find_branch(onto_branch, BranchType::Local)?;
    let onto_ref = branch.into_reference();
    let onto_annotated = repo.reference_to_annotated_commit(&onto_ref)?;

    let head_annotated = repo.reference_to_annotated_commit(&repo.head()?)?;

    let mut opts = RebaseOptions::new();
    let mut rebase = repo.rebase(
        Some(&head_annotated),
        Some(&onto_annotated),
        None,
        Some(&mut opts),
    )?;

    let mut steps = Vec::new();

    while let Some(op) = rebase.next() {
        let operation = op?;
        let oid = operation.id().to_string();
        let message = repo
            .find_commit(operation.id())
            .ok()
            .and_then(|c| c.message().map(|m| m.to_string()))
            .unwrap_or_default();
        steps.push(RebaseStep { oid, message });

        let signature = repo.signature()?;
        rebase.commit(None, &signature, None)?;
    }

    rebase.finish(None)?;

    Ok(steps)
}

pub fn continue_rebase(repo: &Repository) -> Result<()> {
    let mut opts = RebaseOptions::new();
    let mut rebase = repo.open_rebase(Some(&mut opts))?;

    while let Some(op) = rebase.next() {
        let _operation = op?;
        let signature = repo.signature()?;
        rebase.commit(None, &signature, None)?;
    }

    rebase.finish(None)?;

    Ok(())
}

pub fn abort_rebase(repo: &Repository) -> Result<()> {
    let mut opts = RebaseOptions::new();
    let mut rebase = repo.open_rebase(Some(&mut opts))?;
    rebase.abort()?;
    Ok(())
}
