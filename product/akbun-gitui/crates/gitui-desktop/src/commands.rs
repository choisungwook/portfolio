use std::path::Path;

use gitui_core::branch::BranchInfo;
use gitui_core::credential::CredentialStore;
use gitui_core::diff::DiffFile;
use gitui_core::log::CommitInfo;
use gitui_core::merge::MergeResult;
use gitui_core::repo::RepoInfo;
use gitui_core::status::StatusResult;
use tauri::State;

use crate::AppState;

fn with_repo<T>(
    state: &State<AppState>,
    f: impl FnOnce(&git2::Repository) -> gitui_core::Result<T>,
) -> Result<T, String> {
    let guard = state
        .repo
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let repo = guard
        .as_ref()
        .ok_or_else(|| "no repository is open".to_string())?;
    f(repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_repository(path: String, state: State<AppState>) -> Result<RepoInfo, String> {
    let repo = gitui_core::open_repo(Path::new(&path)).map_err(|e| e.to_string())?;
    let info = gitui_core::repo_info(&repo).map_err(|e| e.to_string())?;

    let mut guard = state
        .repo
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    *guard = Some(repo);

    Ok(info)
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> Result<StatusResult, String> {
    with_repo(&state, |repo| gitui_core::status::get_status(repo))
}

#[tauri::command]
pub fn get_log(max_count: usize, state: State<AppState>) -> Result<Vec<CommitInfo>, String> {
    with_repo(&state, |repo| gitui_core::log::get_log(repo, max_count))
}

#[tauri::command]
pub fn get_branches(state: State<AppState>) -> Result<Vec<BranchInfo>, String> {
    with_repo(&state, |repo| gitui_core::branch::list_branches(repo))
}

#[tauri::command]
pub fn get_workdir_diff(state: State<AppState>) -> Result<Vec<DiffFile>, String> {
    with_repo(&state, |repo| gitui_core::diff::get_workdir_diff(repo))
}

#[tauri::command]
pub fn get_staged_diff(state: State<AppState>) -> Result<Vec<DiffFile>, String> {
    with_repo(&state, |repo| gitui_core::diff::get_staged_diff(repo))
}

#[tauri::command]
pub fn get_commit_diff(oid: String, state: State<AppState>) -> Result<Vec<DiffFile>, String> {
    with_repo(&state, |repo| {
        gitui_core::diff::get_commit_diff(repo, &oid)
    })
}

#[tauri::command]
pub fn stage_files(paths: Vec<String>, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |repo| {
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        gitui_core::commit::stage_files(repo, &path_refs)
    })
}

#[tauri::command]
pub fn unstage_files(paths: Vec<String>, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |repo| {
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        gitui_core::commit::unstage_files(repo, &path_refs)
    })
}

#[tauri::command]
pub fn create_commit(message: String, state: State<AppState>) -> Result<String, String> {
    with_repo(&state, |repo| {
        gitui_core::commit::create_commit(repo, &message)
    })
}

#[tauri::command]
pub fn checkout_branch(name: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |repo| {
        gitui_core::branch::checkout_branch(repo, &name)
    })
}

#[tauri::command]
pub fn create_branch(name: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |repo: &git2::Repository| {
        let head = repo.head().map_err(gitui_core::GitError::Git)?;
        let commit = head
            .peel_to_commit()
            .map_err(gitui_core::GitError::Git)?;
        let oid_str = commit.id().to_string();
        gitui_core::branch::create_branch(repo, &name, &oid_str)
    })
}

#[tauri::command]
pub fn delete_branch(name: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |repo| {
        gitui_core::branch::delete_branch(repo, &name)
    })
}

#[tauri::command]
pub fn merge_branch(name: String, state: State<AppState>) -> Result<MergeResult, String> {
    with_repo(&state, |repo| {
        gitui_core::merge::merge_branch(repo, &name)
    })
}

#[tauri::command]
pub fn get_credentials() -> Result<CredentialStore, String> {
    gitui_core::credential::load_credentials().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ssh_keys() -> Result<Vec<String>, String> {
    gitui_core::credential::list_ssh_keys()
        .map(|keys| {
            keys.into_iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_credential(index: usize) -> Result<(), String> {
    let mut store =
        gitui_core::credential::load_credentials().map_err(|e| e.to_string())?;
    store.active_index = Some(index);
    gitui_core::credential::save_credentials(&store).map_err(|e| e.to_string())
}
