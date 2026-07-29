use std::collections::HashMap;
use std::sync::Mutex;

/// Serializes plan/apply per project directory across pull requests.
///
/// A lock key is "owner/repo" + project dir. The first pull request to plan
/// a project holds its lock until apply succeeds, the PR closes, or the PR
/// runs unlock. This prevents two PRs from applying conflicting plans to
/// the same state.
pub struct LockManager {
  locks: Mutex<HashMap<String, u64>>,
}

/// Outcome of a lock attempt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LockOutcome {
  /// The lock is now (or was already) held by this pull request.
  Acquired,
  /// Another pull request holds the lock.
  HeldByOther { pr_number: u64 },
}

impl LockManager {
  pub fn new() -> LockManager {
    LockManager { locks: Mutex::new(HashMap::new()) }
  }

  pub fn try_lock(&self, repo_full_name: &str, dir: &str, pr_number: u64) -> LockOutcome {
    let key = lock_key(repo_full_name, dir);
    let mut locks = self.locks.lock().unwrap();
    match locks.get(&key) {
      Some(&holder) if holder != pr_number => LockOutcome::HeldByOther { pr_number: holder },
      _ => {
        locks.insert(key, pr_number);
        LockOutcome::Acquired
      }
    }
  }

  /// Releases one project lock if held by this pull request.
  pub fn unlock(&self, repo_full_name: &str, dir: &str, pr_number: u64) {
    let key = lock_key(repo_full_name, dir);
    let mut locks = self.locks.lock().unwrap();
    if locks.get(&key) == Some(&pr_number) {
      locks.remove(&key);
    }
  }

  /// Releases every lock this pull request holds in the repository.
  /// Returns the released project dirs.
  pub fn release_all(&self, repo_full_name: &str, pr_number: u64) -> Vec<String> {
    let prefix = format!("{repo_full_name}::");
    let mut locks = self.locks.lock().unwrap();
    let released: Vec<String> = locks
      .iter()
      .filter(|(key, &holder)| key.starts_with(&prefix) && holder == pr_number)
      .map(|(key, _)| key[prefix.len()..].to_string())
      .collect();
    for dir in &released {
      locks.remove(&lock_key(repo_full_name, dir));
    }
    released
  }
}

fn lock_key(repo_full_name: &str, dir: &str) -> String {
  format!("{repo_full_name}::{dir}")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn first_pr_acquires_lock() {
    let locks = LockManager::new();
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 1), LockOutcome::Acquired);
  }

  #[test]
  fn lock_is_reentrant_for_same_pr() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 1), LockOutcome::Acquired);
  }

  #[test]
  fn second_pr_is_rejected_with_holder() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 2), LockOutcome::HeldByOther { pr_number: 1 });
  }

  #[test]
  fn different_projects_do_not_conflict() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    assert_eq!(locks.try_lock("o/r", "aws/rds", 2), LockOutcome::Acquired);
  }

  #[test]
  fn same_dir_in_different_repos_do_not_conflict() {
    let locks = LockManager::new();
    locks.try_lock("o/r1", "aws/vpc", 1);
    assert_eq!(locks.try_lock("o/r2", "aws/vpc", 2), LockOutcome::Acquired);
  }

  #[test]
  fn unlock_frees_the_project_for_others() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    locks.unlock("o/r", "aws/vpc", 1);
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 2), LockOutcome::Acquired);
  }

  #[test]
  fn unlock_by_non_holder_is_a_no_op() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    locks.unlock("o/r", "aws/vpc", 2);
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 3), LockOutcome::HeldByOther { pr_number: 1 });
  }

  #[test]
  fn release_all_frees_only_this_prs_locks() {
    let locks = LockManager::new();
    locks.try_lock("o/r", "aws/vpc", 1);
    locks.try_lock("o/r", "aws/rds", 1);
    locks.try_lock("o/r", "aws/alb", 2);
    let mut released = locks.release_all("o/r", 1);
    released.sort();
    assert_eq!(released, vec!["aws/rds", "aws/vpc"]);
    assert_eq!(locks.try_lock("o/r", "aws/alb", 3), LockOutcome::HeldByOther { pr_number: 2 });
    assert_eq!(locks.try_lock("o/r", "aws/vpc", 3), LockOutcome::Acquired);
  }
}
