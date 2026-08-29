use serde::{Deserialize, Serialize};

const FIELD_SEPARATOR: char = '\x1f';
pub const NO_STATUS: &str = "No status";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
  pub path: String,
  pub name: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoSizeInfo {
  pub path: String,
  pub bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
  pub hash: String,
  pub parents: Vec<String>,
  pub author: String,
  pub date: String,
  pub refs: Vec<String>,
  pub subject: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
  pub name: String,
  pub short_hash: String,
  pub upstream: String,
  pub is_current: bool,
  pub is_remote: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeletionFailure {
  pub name: String,
  pub error: String,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeletionResult {
  pub deleted: Vec<String>,
  pub unmerged: Vec<String>,
  pub failed: Vec<BranchDeletionFailure>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
  pub path: String,
  pub head: String,
  pub branch: String,
  pub is_main: bool,
  pub is_locked: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
  pub number: u64,
  pub title: String,
  pub state: String,
  pub author: String,
  pub head_ref_name: String,
  pub url: String,
  pub updated_at: String,
  pub labels: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IssueInfo {
  pub number: u64,
  pub title: String,
  pub state: String,
  pub author: String,
  pub url: String,
  pub updated_at: String,
  pub labels: Vec<String>,
  pub parent: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadComment {
  pub author: String,
  pub created_at: String,
  pub body: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetail {
  pub kind: String,
  pub number: u64,
  pub title: String,
  pub state: String,
  pub author: String,
  pub url: String,
  pub created_at: String,
  pub updated_at: String,
  pub labels: Vec<String>,
  pub assignees: Vec<String>,
  pub body: String,
  pub comments: Vec<ThreadComment>,
  pub base_ref_name: String,
  pub head_ref_name: String,
  pub additions: u64,
  pub deletions: u64,
  pub changed_files: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
  pub number: u64,
  pub title: String,
  pub url: String,
  pub closed: bool,
  pub item_count: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResult {
  pub owner: String,
  pub name_with_owner: String,
  pub projects: Vec<ProjectInfo>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectItem {
  pub id: String,
  pub title: String,
  pub status: String,
  pub r#type: String,
  pub url: String,
  pub number: u64,
  pub repository: String,
  pub assignees: Vec<String>,
  pub labels: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectColumn {
  pub name: String,
  pub items: Vec<ProjectItem>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoard {
  pub columns: Vec<ProjectColumn>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenerApp {
  pub id: String,
  pub label: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliToolStatus {
  pub id: String,
  pub label: String,
  pub required: bool,
  pub available: bool,
  pub version: String,
  pub path: String,
  pub auth_status: String,
  pub authenticated: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
  pub git: CliToolStatus,
  pub gh: CliToolStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub theme: String,
  pub force_remove_worktree: bool,
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      theme: "system".into(),
      force_remove_worktree: false,
    }
  }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
  pub path: String,
  pub status: String,
  pub old_path: String,
}

pub fn parse_log(output: &str) -> Vec<CommitInfo> {
  output
    .lines()
    .filter(|line| !line.is_empty())
    .map(|line| {
      let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
      CommitInfo {
        hash: field(&fields, 0),
        parents: fields.get(1).unwrap_or(&"").split_whitespace().map(str::to_owned).collect(),
        author: field(&fields, 2),
        date: field(&fields, 3),
        refs: fields
          .get(4)
          .unwrap_or(&"")
          .split(", ")
          .filter(|value| !value.is_empty())
          .map(str::to_owned)
          .collect(),
        subject: field(&fields, 5),
      }
    })
    .collect()
}

pub fn parse_branches(output: &str) -> Vec<BranchInfo> {
  output
    .lines()
    .filter(|line| !line.is_empty() && !line.contains("HEAD detached"))
    .filter_map(|line| {
      let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
      let name = field(&fields, 1);
      if name.ends_with("/HEAD") || name.is_empty() {
        return None;
      }
      Some(BranchInfo {
        is_remote: fields.first().unwrap_or(&"").starts_with("refs/remotes/"),
        name,
        short_hash: field(&fields, 2),
        upstream: field(&fields, 3),
        is_current: fields.get(4) == Some(&"*"),
      })
    })
    .collect()
}

pub fn parse_worktrees(output: &str) -> Vec<WorktreeInfo> {
  let mut result = Vec::new();
  let mut path = String::new();
  let mut head = String::new();
  let mut branch = "(detached)".to_string();
  let mut locked = false;

  let flush = |result: &mut Vec<WorktreeInfo>, path: &mut String, head: &mut String, branch: &mut String, locked: &mut bool| {
    if path.is_empty() {
      return;
    }
    result.push(WorktreeInfo {
      path: std::mem::take(path),
      head: std::mem::take(head),
      branch: std::mem::replace(branch, "(detached)".into()),
      is_main: result.is_empty(),
      is_locked: std::mem::take(locked),
    });
  };

  for line in output.lines() {
    if let Some(value) = line.strip_prefix("worktree ") {
      flush(&mut result, &mut path, &mut head, &mut branch, &mut locked);
      path = value.to_string();
    } else if let Some(value) = line.strip_prefix("HEAD ") {
      head = value.chars().take(7).collect();
    } else if let Some(value) = line.strip_prefix("branch ") {
      branch = value.strip_prefix("refs/heads/").unwrap_or(value).to_string();
    } else if line.starts_with("locked") {
      locked = true;
    }
  }
  flush(&mut result, &mut path, &mut head, &mut branch, &mut locked);
  result
}

pub fn parse_name_status(output: &str) -> Vec<FileChange> {
  output
    .lines()
    .filter_map(|line| {
      let fields: Vec<&str> = line.split('\t').collect();
      let status = fields.first()?.to_string();
      let renamed = status.starts_with('R') || status.starts_with('C');
      let path = fields.get(if renamed { 2 } else { 1 })?.to_string();
      Some(FileChange {
        path,
        status,
        old_path: if renamed { field(&fields, 1) } else { String::new() },
      })
    })
    .collect()
}

pub fn build_project_columns(items: Vec<ProjectItem>, status_order: Vec<String>) -> Vec<ProjectColumn> {
  let mut names: Vec<String> = status_order.into_iter().filter(|name| name != NO_STATUS).collect();
  for item in &items {
    if item.status != NO_STATUS && !names.contains(&item.status) {
      names.push(item.status.clone());
    }
  }
  if items.iter().any(|item| item.status == NO_STATUS) {
    names.push(NO_STATUS.into());
  }
  names
    .into_iter()
    .map(|name| ProjectColumn {
      items: items.iter().filter(|item| item.status == name).cloned().collect(),
      name,
    })
    .collect()
}

pub fn number_arg(value: u64) -> Result<String, String> {
  if value == 0 {
    Err("Not a valid number: 0".into())
  } else {
    Ok(value.to_string())
  }
}

fn field(fields: &[&str], index: usize) -> String {
  fields.get(index).unwrap_or(&"").to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_git_log_fields() {
    let output = "abc\x1fparent one\x1fAda\x1f2026-08-29\x1fHEAD -> main, tag: v1\x1fship it";
    let rows = parse_log(output);
    assert_eq!(rows[0].parents, vec!["parent", "one"]);
    assert_eq!(rows[0].refs, vec!["HEAD -> main", "tag: v1"]);
    assert_eq!(rows[0].subject, "ship it");
  }

  #[test]
  fn parses_renamed_file() {
    assert_eq!(
      parse_name_status("R100\told name\tnew name"),
      vec![FileChange {
        path: "new name".into(),
        status: "R100".into(),
        old_path: "old name".into(),
      }]
    );
  }

  #[test]
  fn keeps_no_status_column_last() {
    let item = |status: &str| ProjectItem {
      id: status.into(),
      title: status.into(),
      status: status.into(),
      r#type: "Issue".into(),
      url: String::new(),
      number: 1,
      repository: String::new(),
      assignees: vec![],
      labels: vec![],
    };
    let columns = build_project_columns(
      vec![item(NO_STATUS), item("Done"), item("Doing")],
      vec!["Doing".into(), "Done".into()],
    );
    assert_eq!(columns.iter().map(|column| column.name.as_str()).collect::<Vec<_>>(), vec!["Doing", "Done", NO_STATUS]);
  }
}
