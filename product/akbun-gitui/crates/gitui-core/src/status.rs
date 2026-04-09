use git2::{Repository, StatusOptions};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileStatusKind {
    New,
    Modified,
    Deleted,
    Renamed,
    Typechange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub status: FileStatusKind,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct StatusResult {
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<FileStatus>,
}

pub fn get_status(repo: &Repository) -> Result<StatusResult> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut result = StatusResult::default();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.is_index_new() {
            result.staged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::New,
            });
        }
        if status.is_index_modified() {
            result.staged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Modified,
            });
        }
        if status.is_index_deleted() {
            result.staged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Deleted,
            });
        }
        if status.is_index_renamed() {
            result.staged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Renamed,
            });
        }
        if status.is_index_typechange() {
            result.staged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Typechange,
            });
        }

        if status.is_wt_modified() {
            result.unstaged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Modified,
            });
        }
        if status.is_wt_deleted() {
            result.unstaged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Deleted,
            });
        }
        if status.is_wt_renamed() {
            result.unstaged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Renamed,
            });
        }
        if status.is_wt_typechange() {
            result.unstaged.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::Typechange,
            });
        }
        if status.is_wt_new() {
            result.untracked.push(FileStatus {
                path: path.clone(),
                status: FileStatusKind::New,
            });
        }
    }

    Ok(result)
}
