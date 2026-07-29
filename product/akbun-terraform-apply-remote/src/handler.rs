use crate::command::{self, Command, ParseError};
use crate::config::Config;
use crate::events::{Event, RepoRef};
use crate::format::{render_comment, RunResult};
use crate::github::GithubClient;
use crate::locks::{LockManager, LockOutcome};
use crate::{project, terraform, workspace};
use std::collections::HashMap;
use std::sync::Mutex;

/// State shared across webhook deliveries: locks and the record of which
/// head SHA each saved plan was produced from.
pub struct AppState {
  pub cfg: Config,
  pub locks: LockManager,
  planned_shas: Mutex<HashMap<String, String>>,
}

impl AppState {
  pub fn new(cfg: Config) -> AppState {
    AppState { cfg, locks: LockManager::new(), planned_shas: Mutex::new(HashMap::new()) }
  }

  fn record_plan(&self, repo: &RepoRef, pr_number: u64, dir: &str, sha: &str) {
    let key = plan_key(repo, pr_number, dir);
    self.planned_shas.lock().unwrap().insert(key, sha.to_string());
  }

  fn planned_sha(&self, repo: &RepoRef, pr_number: u64, dir: &str) -> Option<String> {
    self.planned_shas.lock().unwrap().get(&plan_key(repo, pr_number, dir)).cloned()
  }

  fn forget_plan(&self, repo: &RepoRef, pr_number: u64, dir: &str) {
    self.planned_shas.lock().unwrap().remove(&plan_key(repo, pr_number, dir));
  }

  fn planned_dirs(&self, repo: &RepoRef, pr_number: u64) -> Vec<String> {
    let prefix = format!("{}::{}::", repo.full_name(), pr_number);
    let mut dirs: Vec<String> = self
      .planned_shas
      .lock()
      .unwrap()
      .keys()
      .filter(|key| key.starts_with(&prefix))
      .map(|key| key[prefix.len()..].to_string())
      .collect();
    dirs.sort();
    dirs
  }

  fn forget_pr(&self, repo: &RepoRef, pr_number: u64) {
    let prefix = format!("{}::{}::", repo.full_name(), pr_number);
    self.planned_shas.lock().unwrap().retain(|key, _| !key.starts_with(&prefix));
  }
}

fn plan_key(repo: &RepoRef, pr_number: u64, dir: &str) -> String {
  format!("{}::{}::{}", repo.full_name(), pr_number, dir)
}

/// Entry point for one interpreted webhook event. Errors end up as PR
/// comments where possible, otherwise on stderr.
pub fn handle_event(state: &AppState, event: Event) {
  let outcome = match &event {
    Event::Comment { repo, pr_number, body, author: _ } => {
      handle_comment(state, repo, *pr_number, body)
    }
    Event::PrUpdated { repo, pr_number } => autoplan(state, repo, *pr_number),
    Event::PrClosed { repo, pr_number } => cleanup_pr(state, repo, *pr_number),
  };
  if let Err(e) = outcome {
    eprintln!("event handling failed: {e} (event: {event:?})");
  }
}

fn handle_comment(state: &AppState, repo: &RepoRef, pr_number: u64, body: &str) -> Result<(), String> {
  let github = client(state);
  match command::parse(&state.cfg.trigger, body) {
    Ok(Command::Plan { dir }) => run_plan(state, repo, pr_number, dir),
    Ok(Command::Apply { dir }) => run_apply(state, repo, pr_number, dir),
    Ok(Command::Unlock) => {
      let released = state.locks.release_all(&repo.full_name(), pr_number);
      state.forget_pr(repo, pr_number);
      let message = if released.is_empty() {
        "This pull request holds no locks.".to_string()
      } else {
        format!("Released locks: {}", released.join(", "))
      };
      github.post_comment(repo, pr_number, &message)
    }
    Ok(Command::Help) => github.post_comment(repo, pr_number, &command::usage(&state.cfg.trigger)),
    Err(ParseError::NotACommand) => Ok(()),
    Err(ParseError::Unrecognized(reason)) => {
      let message = format!("{reason}\n\n{}", command::usage(&state.cfg.trigger));
      github.post_comment(repo, pr_number, &message)
    }
  }
}

/// Plans automatically when a PR opens or its head moves, mirroring
/// Atlantis autoplan. Stays silent when no terraform project changed.
fn autoplan(state: &AppState, repo: &RepoRef, pr_number: u64) -> Result<(), String> {
  let github = client(state);
  let changed = github.list_changed_files(repo, pr_number)?;
  if project::projects_from_changed_files(&changed).is_empty() {
    return Ok(());
  }
  run_plan(state, repo, pr_number, None)
}

fn run_plan(
  state: &AppState,
  repo: &RepoRef,
  pr_number: u64,
  dir_override: Option<String>,
) -> Result<(), String> {
  let github = client(state);
  let pr = github.get_pr(repo, pr_number)?;
  let dirs = match dir_override {
    Some(dir) => vec![dir],
    None => project::projects_from_changed_files(&github.list_changed_files(repo, pr_number)?),
  };
  if dirs.is_empty() {
    return github.post_comment(
      repo,
      pr_number,
      "No terraform projects changed in this pull request. \
       Use -d <dir> to plan a specific directory.",
    );
  }

  let ws = workspace::checkout_pr(&state.cfg.data_dir, &state.cfg.github_token, repo, pr_number, &pr.head_sha)?;
  let mut results = Vec::new();
  for dir in dirs {
    results.push(plan_one_project(state, repo, pr_number, &pr.head_sha, &ws, &dir));
  }
  github.post_comment(repo, pr_number, &render_comment("plan", &results))
}

fn plan_one_project(
  state: &AppState,
  repo: &RepoRef,
  pr_number: u64,
  head_sha: &str,
  ws: &workspace::Workspace,
  dir: &str,
) -> RunResult {
  match state.locks.try_lock(&repo.full_name(), dir, pr_number) {
    LockOutcome::HeldByOther { pr_number: holder } => {
      return RunResult {
        dir: dir.to_string(),
        success: false,
        output: format!(
          "This project is locked by pull request #{holder}. \
           Wait for it to apply or ask it to run unlock."
        ),
      };
    }
    LockOutcome::Acquired => {}
  }

  let project_dir = ws.dir.join(dir);
  if !project_dir.is_dir() {
    return RunResult {
      dir: dir.to_string(),
      success: false,
      output: format!("directory not found in the PR head: {dir}"),
    };
  }
  let init = terraform::init(&state.cfg.terraform_bin, &project_dir);
  if !init.success {
    return RunResult { dir: dir.to_string(), success: false, output: init.output };
  }
  let plan = terraform::plan(&state.cfg.terraform_bin, &project_dir);
  if plan.success {
    state.record_plan(repo, pr_number, dir, head_sha);
  }
  RunResult { dir: dir.to_string(), success: plan.success, output: plan.output }
}

fn run_apply(
  state: &AppState,
  repo: &RepoRef,
  pr_number: u64,
  dir_override: Option<String>,
) -> Result<(), String> {
  let github = client(state);
  let pr = github.get_pr(repo, pr_number)?;
  let dirs = match dir_override {
    Some(dir) => vec![dir],
    None => state.planned_dirs(repo, pr_number),
  };
  if dirs.is_empty() {
    return github.post_comment(
      repo,
      pr_number,
      &format!("Nothing to apply. Run \"{} plan\" first.", state.cfg.trigger),
    );
  }

  let ws = workspace::checkout_pr(&state.cfg.data_dir, &state.cfg.github_token, repo, pr_number, &pr.head_sha)?;
  let mut results = Vec::new();
  for dir in dirs {
    results.push(apply_one_project(state, repo, pr_number, &pr.head_sha, &ws, &dir));
  }
  github.post_comment(repo, pr_number, &render_comment("apply", &results))
}

fn apply_one_project(
  state: &AppState,
  repo: &RepoRef,
  pr_number: u64,
  head_sha: &str,
  ws: &workspace::Workspace,
  dir: &str,
) -> RunResult {
  let fail = |output: String| RunResult { dir: dir.to_string(), success: false, output };

  match state.planned_sha(repo, pr_number, dir) {
    None => {
      return fail(format!(
        "No saved plan for this directory. Run \"{} plan -d {dir}\" first.",
        state.cfg.trigger
      ))
    }
    Some(planned) if planned != head_sha => {
      return fail(format!(
        "The pull request changed after the last plan (planned {}, head is now {}). \
         Run \"{} plan\" again and review the new plan.",
        short(&planned),
        short(head_sha),
        state.cfg.trigger
      ))
    }
    Some(_) => {}
  }
  if let LockOutcome::HeldByOther { pr_number: holder } =
    state.locks.try_lock(&repo.full_name(), dir, pr_number)
  {
    return fail(format!("This project is locked by pull request #{holder}."));
  }

  let project_dir = ws.dir.join(dir);
  if !project_dir.join(terraform::PLAN_FILE).exists() {
    return fail(format!(
      "The saved plan file is gone (server restarted?). Run \"{} plan -d {dir}\" again.",
      state.cfg.trigger
    ));
  }
  let apply = terraform::apply_saved_plan(&state.cfg.terraform_bin, &project_dir);
  if apply.success {
    state.forget_plan(repo, pr_number, dir);
    state.locks.unlock(&repo.full_name(), dir, pr_number);
  }
  RunResult { dir: dir.to_string(), success: apply.success, output: apply.output }
}

fn cleanup_pr(state: &AppState, repo: &RepoRef, pr_number: u64) -> Result<(), String> {
  state.locks.release_all(&repo.full_name(), pr_number);
  state.forget_pr(repo, pr_number);
  workspace::remove_pr_workspace(&state.cfg.data_dir, repo, pr_number);
  Ok(())
}

fn short(sha: &str) -> &str {
  &sha[..sha.len().min(7)]
}

fn client(state: &AppState) -> GithubClient {
  GithubClient::new(&state.cfg.github_api, &state.cfg.github_token)
}
