use std::path::Path;

use git2::Repository;

use crate::error::Result;

pub fn stage_files(repo: &Repository, paths: &[&str]) -> Result<()> {
    let mut index = repo.index()?;
    for path in paths {
        index.add_path(Path::new(path))?;
    }
    index.write()?;
    Ok(())
}

pub fn unstage_files(repo: &Repository, paths: &[&str]) -> Result<()> {
    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit()?;
            let pathspecs: Vec<&str> = paths.to_vec();
            repo.reset_default(Some(head_commit.as_object()), pathspecs)?;
        }
        Err(_) => {
            let mut index = repo.index()?;
            for path in paths {
                index.remove_path(Path::new(path))?;
            }
            index.write()?;
        }
    }
    Ok(())
}

pub fn stage_all(repo: &Repository) -> Result<()> {
    let mut index = repo.index()?;
    index.add_all(["*"], git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    Ok(())
}

pub fn create_commit(repo: &Repository, message: &str) -> Result<String> {
    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let signature = repo.signature()?;

    let parent_commit = match repo.head() {
        Ok(head) => Some(head.peel_to_commit()?),
        Err(_) => None,
    };

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let oid = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parents,
    )?;

    Ok(oid.to_string())
}
