use chrono::{DateTime, TimeZone, Utc};
use git2::{Oid, Repository, Revwalk};
use serde::{Deserialize, Serialize};

use crate::error::{GitError, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub author: String,
    pub email: String,
    pub message: String,
    pub time: DateTime<Utc>,
    pub parent_count: usize,
}

fn commit_to_info(commit: &git2::Commit) -> CommitInfo {
    let id = commit.id().to_string();
    let short_id = id[..7.min(id.len())].to_string();
    let author = commit.author();
    let epoch = commit.time().seconds();
    let time = Utc
        .timestamp_opt(epoch, 0)
        .single()
        .unwrap_or_else(Utc::now);

    CommitInfo {
        id,
        short_id,
        author: author.name().unwrap_or("").to_string(),
        email: author.email().unwrap_or("").to_string(),
        message: commit.message().unwrap_or("").to_string(),
        time,
        parent_count: commit.parent_count(),
    }
}

pub fn get_log(repo: &Repository, max_count: usize) -> Result<Vec<CommitInfo>> {
    let mut revwalk: Revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut commits = Vec::new();
    for oid_result in revwalk.take(max_count) {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;
        commits.push(commit_to_info(&commit));
    }

    Ok(commits)
}

pub fn get_commit_detail(repo: &Repository, oid_str: &str) -> Result<CommitInfo> {
    let oid = Oid::from_str(oid_str).map_err(|e| GitError::Git(e))?;
    let commit = repo.find_commit(oid)?;
    Ok(commit_to_info(&commit))
}
