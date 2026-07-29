use crate::events::RepoRef;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Per-PR checkout of the repository under the data directory.
///
/// The PR head is fetched from the base repository's "pull/N/head" ref, so
/// pull requests from forks work without extra credentials.
pub struct Workspace {
  pub dir: PathBuf,
}

pub fn checkout_pr(
  data_dir: &str,
  token: &str,
  repo: &RepoRef,
  pr_number: u64,
  head_sha: &str,
) -> Result<Workspace, String> {
  let dir = pr_dir(data_dir, repo, pr_number);
  let clone_url = format!("https://x-access-token:{}@github.com/{}.git", token, repo.full_name());
  // git prints remote URLs in its error output; keep the token out of
  // anything that may end up in a PR comment.
  let redact = |e: String| e.replace(token, "***");

  if !dir.join(".git").exists() {
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    git(&dir, &["init", "--quiet"])?;
    git(&dir, &["remote", "add", "origin", &clone_url]).map_err(redact)?;
  } else {
    git(&dir, &["remote", "set-url", "origin", &clone_url]).map_err(redact)?;
  }
  git(&dir, &["fetch", "--quiet", "origin", &format!("pull/{pr_number}/head")]).map_err(redact)?;
  git(&dir, &["checkout", "--quiet", "--force", head_sha])?;
  // Drop leftovers from previous runs but keep terraform caches and saved
  // plans, which live in ignored paths the next plan run overwrites anyway.
  git(&dir, &["clean", "-fd", "--quiet", "--exclude=.terraform", "--exclude=*.tfplan"])?;
  Ok(Workspace { dir })
}

pub fn remove_pr_workspace(data_dir: &str, repo: &RepoRef, pr_number: u64) {
  let dir = pr_dir(data_dir, repo, pr_number);
  let _ = std::fs::remove_dir_all(dir);
}

fn pr_dir(data_dir: &str, repo: &RepoRef, pr_number: u64) -> PathBuf {
  Path::new(data_dir).join("repos").join(&repo.owner).join(&repo.name).join(format!("pr-{pr_number}"))
}

fn git(dir: &Path, args: &[&str]) -> Result<(), String> {
  let result = Command::new("git")
    .args(args)
    .current_dir(dir)
    .output()
    .map_err(|e| format!("failed to execute git: {e}"))?;
  if result.status.success() {
    Ok(())
  } else {
    // The clone URL embeds the token; never echo the command line back.
    Err(format!("git {} failed: {}", args[0], String::from_utf8_lossy(&result.stderr).trim()))
  }
}
