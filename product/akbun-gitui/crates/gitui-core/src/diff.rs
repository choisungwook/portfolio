use git2::{DiffOptions, Oid, Patch, Repository};
use serde::{Deserialize, Serialize};

use crate::error::{GitError, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffLine {
    pub content: String,
    pub origin: char,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffFile {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub hunks: Vec<DiffHunk>,
}

fn parse_diff(diff: &git2::Diff) -> Result<Vec<DiffFile>> {
    let mut files: Vec<DiffFile> = Vec::new();
    let num_deltas = diff.deltas().len();

    for idx in 0..num_deltas {
        let patch = Patch::from_diff(diff, idx)?;
        let Some(patch) = patch else {
            continue;
        };

        let delta = patch.delta();
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());

        let mut hunks = Vec::new();
        for hunk_idx in 0..patch.num_hunks() {
            let (hunk, _num_lines) = patch.hunk(hunk_idx)?;
            let header = String::from_utf8_lossy(hunk.header()).to_string();

            let mut lines = Vec::new();
            for line_idx in 0..patch.num_lines_in_hunk(hunk_idx)? {
                let line = patch.line_in_hunk(hunk_idx, line_idx)?;
                let content = String::from_utf8_lossy(line.content()).to_string();
                lines.push(DiffLine {
                    content,
                    origin: line.origin(),
                });
            }

            hunks.push(DiffHunk { header, lines });
        }

        files.push(DiffFile {
            old_path,
            new_path,
            hunks,
        });
    }

    Ok(files)
}

pub fn get_workdir_diff(repo: &Repository) -> Result<Vec<DiffFile>> {
    let mut opts = DiffOptions::new();
    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))?;
    parse_diff(&diff)
}

pub fn get_staged_diff(repo: &Repository) -> Result<Vec<DiffFile>> {
    let head_tree = match repo.head() {
        Ok(head) => Some(head.peel_to_tree()?),
        Err(_) => None,
    };

    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?;
    parse_diff(&diff)
}

pub fn get_commit_diff(repo: &Repository, oid_str: &str) -> Result<Vec<DiffFile>> {
    let oid = Oid::from_str(oid_str).map_err(|e| GitError::Git(e))?;
    let commit = repo.find_commit(oid)?;
    let tree = commit.tree()?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };

    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    parse_diff(&diff)
}
