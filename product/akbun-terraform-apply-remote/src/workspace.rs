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
  // The remote URL stays token-free; credentials are passed per fetch via
  // an HTTP header so the token never lands in .git/config (which persists
  // on disk, including shared EFS volumes).
  let clone_url = format!("https://github.com/{}.git", repo.full_name());
  let auth_config = format!("http.extraheader=Authorization: Basic {}", basic_auth(token));
  let redact = |e: String| e.replace(token, "***");

  if !dir.join(".git").exists() {
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    git(&dir, &["init", "--quiet"])?;
    git(&dir, &["remote", "add", "origin", &clone_url])?;
  } else {
    // Also scrubs tokens that an older version left in the remote URL.
    git(&dir, &["remote", "set-url", "origin", &clone_url])?;
  }
  git(&dir, &["-c", &auth_config, "fetch", "--quiet", "origin", &format!("pull/{pr_number}/head")])
    .map_err(redact)?;
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

/// Value for a "Authorization: Basic ..." header authenticating as the
/// x-access-token pseudo-user, the same scheme actions/checkout uses.
fn basic_auth(token: &str) -> String {
  base64(format!("x-access-token:{token}").as_bytes())
}

/// Standard base64 (RFC 4648, with padding). Hand-rolled to keep the
/// dependency tree small; verified against known vectors in tests.
fn base64(input: &[u8]) -> String {
  const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::new();
  for chunk in input.chunks(3) {
    let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
    let n = u32::from(b[0]) << 16 | u32::from(b[1]) << 8 | u32::from(b[2]);
    out.push(ALPHABET[(n >> 18) as usize & 63] as char);
    out.push(ALPHABET[(n >> 12) as usize & 63] as char);
    out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
    out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
  }
  out
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
    // Only the subcommand name is echoed back, never the full arguments:
    // a "-c" config value carries the auth header. Skip "-c <value>" pairs.
    let mut iter = args.iter();
    let mut subcommand = "git";
    while let Some(arg) = iter.next() {
      if *arg == "-c" {
        iter.next();
        continue;
      }
      if !arg.starts_with('-') {
        subcommand = arg;
        break;
      }
    }
    Err(format!("git {} failed: {}", subcommand, String::from_utf8_lossy(&result.stderr).trim()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn base64_matches_known_vectors() {
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(b"foobar"), "Zm9vYmFy");
  }

  #[test]
  fn basic_auth_encodes_the_checkout_scheme() {
    // echo -n "x-access-token:tok" | base64
    assert_eq!(basic_auth("tok"), "eC1hY2Nlc3MtdG9rZW46dG9r");
  }
}
