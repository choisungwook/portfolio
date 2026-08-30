use crate::store;
use gitdesktop_core::{
    build_project_columns, number_arg, parse_branches, parse_log, parse_name_status,
    parse_worktrees, AppSettings, BranchDeletionFailure, BranchDeletionResult, BranchInfo,
    CliStatus, CliToolStatus, CommitInfo, FileChange, IssueInfo, OpenerApp, ProjectBoard,
    ProjectInfo, ProjectItem, ProjectListResult, PullRequestInfo, RepoEntry, RepoSizeInfo,
    ThreadComment, ThreadDetail, WorktreeInfo, NO_STATUS,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};
use tauri::{AppHandle, WebviewWindow};

const FIELD_SEPARATOR: &str = "\x1f";
const LIST_LIMIT: &str = "50";
const PARENT_LOOKUP_LIMIT: &str = "100";
const BOARD_ITEM_LIMIT: &str = "200";
const FIELD_LIMIT: &str = "50";

fn resolve_cli(command: &str) -> PathBuf {
    if cfg!(windows) {
        return PathBuf::from(command);
    }

    let mut directories: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();
    directories.extend(
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/run/current-system/sw/bin",
        ]
        .map(PathBuf::from),
    );
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        directories.extend([
            home.join("bin"),
            home.join(".local/bin"),
            home.join(".nix-profile/bin"),
            home.join(".asdf/shims"),
            home.join(".local/share/mise/shims"),
        ]);
    }

    let mut seen = HashSet::new();
    directories
        .into_iter()
        .filter(|directory| seen.insert(directory.clone()))
        .map(|directory| directory.join(command))
        .find(|candidate| is_executable_file(candidate))
        .unwrap_or_else(|| PathBuf::from(command))
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    true
}

fn run_output(cwd: Option<&Path>, command: &str, args: &[String]) -> Result<Output, String> {
    let executable = resolve_cli(command);
    let mut process = Command::new(executable);
    process.args(args);
    if let Some(directory) = cwd {
        process.current_dir(directory);
    }
    process.output().map_err(|error| error.to_string())
}

fn run_cli(cwd: Option<&Path>, command: &str, args: &[String]) -> Result<String, String> {
    let output = run_output(cwd, command, args)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{command} exited with {}", output.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn run_git(repo_path: &str, args: &[String]) -> Result<String, String> {
    run_cli(Some(Path::new(repo_path)), "git", args)
}

fn run_gh(repo_path: &str, args: &[String]) -> Result<String, String> {
    run_cli(Some(Path::new(repo_path)), "gh", args)
}

fn inspect_cli(id: &str, label: &str, required: bool) -> CliToolStatus {
    let executable = resolve_cli(id);
    let version = run_output(None, id, &strings(&["--version"]));
    let available = version.as_ref().is_ok_and(|output| output.status.success());
    let version_text = version
        .as_ref()
        .ok()
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .to_string()
        })
        .unwrap_or_default();
    let auth = if id == "gh" && available {
        run_output(None, id, &strings(&["auth", "status"])).ok()
    } else {
        None
    };
    let auth_status = auth
        .as_ref()
        .map(|output| {
            format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string()
        })
        .unwrap_or_default();

    CliToolStatus {
        id: id.into(),
        label: label.into(),
        required,
        available,
        version: version_text,
        path: if available {
            executable.to_string_lossy().into_owned()
        } else {
            String::new()
        },
        auth_status,
        authenticated: auth.is_some_and(|output| output.status.success()),
    }
}

#[tauri::command]
pub fn check_cli_tools() -> CliStatus {
    CliStatus {
        git: inspect_cli("git", "git CLI", true),
        gh: inspect_cli("gh", "gh CLI", false),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    store::load_settings(&app)
}

pub fn apply_theme(window: &WebviewWindow, theme: &str) -> Result<(), String> {
    let wanted = match theme {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    window.set_theme(wanted).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_theme(
    app: AppHandle,
    window: WebviewWindow,
    theme: String,
) -> Result<AppSettings, String> {
    let mut settings = store::load_settings(&app);
    settings.theme = if matches!(theme.as_str(), "light" | "dark") {
        theme
    } else {
        "system".into()
    };
    apply_theme(&window, &settings.theme)?;
    store::save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_force_remove_worktree(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = store::load_settings(&app);
    settings.force_remove_worktree = enabled;
    store::save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn list_repos(app: AppHandle) -> Vec<RepoEntry> {
    store::load_repos(&app)
}

#[tauri::command]
pub fn import_repo(app: AppHandle, repo_path: String) -> Result<Vec<RepoEntry>, String> {
    let inside = run_git(
        &repo_path,
        &strings(&["rev-parse", "--is-inside-work-tree"]),
    )?;
    if inside.trim() != "true" {
        return Err("The selected folder is not a git repository.".into());
    }
    let mut repos = store::load_repos(&app);
    if !repos.iter().any(|repo| repo.path == repo_path) {
        let name = Path::new(&repo_path)
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| repo_path.clone());
        repos.push(RepoEntry {
            path: repo_path,
            name,
        });
        store::save_repos(&app, &repos)?;
    }
    Ok(repos)
}

#[tauri::command]
pub fn remove_repo(app: AppHandle, repo_path: String) -> Result<Vec<RepoEntry>, String> {
    let repos: Vec<RepoEntry> = store::load_repos(&app)
        .into_iter()
        .filter(|repo| repo.path != repo_path)
        .collect();
    store::save_repos(&app, &repos)?;
    Ok(repos)
}

fn directory_size(root: &Path) -> Result<u64, String> {
    let mut pending = vec![root.to_path_buf()];
    let mut bytes = 0;
    while let Some(current) = pending.pop() {
        for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
            if metadata.is_dir() {
                pending.push(entry.path());
            } else {
                bytes += metadata.len();
            }
        }
    }
    Ok(bytes)
}

#[tauri::command]
pub fn get_repo_sizes(app: AppHandle) -> Vec<RepoSizeInfo> {
    store::load_repos(&app)
        .into_iter()
        .map(|repo| {
            let git_directory = run_git(&repo.path, &strings(&["rev-parse", "--absolute-git-dir"]));
            let bytes = git_directory
                .ok()
                .and_then(|path| directory_size(Path::new(path.trim())).ok());
            RepoSizeInfo {
                path: repo.path,
                bytes,
            }
        })
        .collect()
}

#[tauri::command]
pub fn get_log(repo_path: String) -> Result<Vec<CommitInfo>, String> {
    let format = ["%H", "%P", "%an", "%ad", "%D", "%s"].join(FIELD_SEPARATOR);
    let output = run_git(
        &repo_path,
        &[
            "log".into(),
            "--branches".into(),
            "--remotes".into(),
            "--tags".into(),
            "--topo-order".into(),
            "--max-count=500".into(),
            "--date=format:%Y-%m-%d %H:%M".into(),
            format!("--pretty=format:{format}"),
        ],
    )?;
    Ok(parse_log(&output))
}

#[tauri::command]
pub fn get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let format = [
        "%(refname)",
        "%(refname:short)",
        "%(objectname:short)",
        "%(upstream:short)",
        "%(HEAD)",
    ]
    .join(FIELD_SEPARATOR);
    let output = run_git(
        &repo_path,
        &[
            "branch".into(),
            "--all".into(),
            "--sort=-committerdate".into(),
            format!("--format={format}"),
        ],
    )?;
    Ok(parse_branches(&output))
}

#[tauri::command]
pub fn get_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    run_git(&repo_path, &strings(&["worktree", "list", "--porcelain"]))
        .map(|output| parse_worktrees(&output))
}

#[tauri::command]
pub fn create_branch(repo_path: String, name: String, start_point: String) -> Result<(), String> {
    let mut args = vec!["branch".into(), name];
    if !start_point.is_empty() {
        args.push(start_point);
    }
    run_git(&repo_path, &args).map(|_| ())
}

#[tauri::command]
pub fn delete_branches(repo_path: String, names: Vec<String>) -> BranchDeletionResult {
    let mut result = BranchDeletionResult::default();
    for name in names {
        let deletion = run_git(
            &repo_path,
            &["branch".into(), "-D".into(), "--".into(), name.clone()],
        );
        match deletion {
            Ok(_) => result.deleted.push(name),
            Err(error) => result.failed.push(BranchDeletionFailure { name, error }),
        }
    }
    result
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    worktree_path: String,
    branch: String,
    create_new_branch: bool,
) -> Result<(), String> {
    let args = if create_new_branch {
        vec![
            "worktree".into(),
            "add".into(),
            "-b".into(),
            branch,
            worktree_path,
        ]
    } else {
        vec!["worktree".into(), "add".into(), worktree_path, branch]
    };
    run_git(&repo_path, &args).map(|_| ())
}

#[tauri::command]
pub fn remove_worktree(
    app: AppHandle,
    repo_path: String,
    worktree_path: String,
) -> Result<bool, String> {
    let mut args = vec!["worktree".into(), "remove".into(), worktree_path];
    if store::load_settings(&app).force_remove_worktree {
        args.push("--force".into());
    }
    run_git(&repo_path, &args).map(|_| true)
}

#[tauri::command]
pub fn get_default_branch(repo_path: String) -> String {
    if let Ok(output) = run_git(
        &repo_path,
        &strings(&["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
    ) {
        if !output.trim().is_empty() {
            return output.trim().into();
        }
    }
    for candidate in ["main", "master", "develop"] {
        for (reference, name) in [
            (format!("refs/heads/{candidate}"), candidate.to_string()),
            (
                format!("refs/remotes/origin/{candidate}"),
                format!("origin/{candidate}"),
            ),
        ] {
            let args = vec![
                "rev-parse".into(),
                "--verify".into(),
                "--quiet".into(),
                reference,
            ];
            if run_git(&repo_path, &args).is_ok() {
                return name;
            }
        }
    }
    "HEAD".into()
}

#[tauri::command]
pub fn get_commit_files(repo_path: String, hash: String) -> Result<Vec<FileChange>, String> {
    run_git(
        &repo_path,
        &[
            "show".into(),
            "--first-parent".into(),
            "--name-status".into(),
            "--format=".into(),
            "--no-color".into(),
            hash,
        ],
    )
    .map(|output| parse_name_status(&output))
}

#[tauri::command]
pub fn get_commit_diff(
    repo_path: String,
    hash: String,
    file_path: String,
) -> Result<String, String> {
    run_git(
        &repo_path,
        &[
            "show".into(),
            "--first-parent".into(),
            "--format=".into(),
            "--no-color".into(),
            hash,
            "--".into(),
            file_path,
        ],
    )
}

#[tauri::command]
pub fn get_range_files(
    repo_path: String,
    base: String,
    head: String,
) -> Result<Vec<FileChange>, String> {
    run_git(
        &repo_path,
        &[
            "diff".into(),
            "--name-status".into(),
            "--no-color".into(),
            format!("{base}...{head}"),
        ],
    )
    .map(|output| parse_name_status(&output))
}

#[tauri::command]
pub fn get_range_diff(
    repo_path: String,
    base: String,
    head: String,
    file_path: String,
) -> Result<String, String> {
    run_git(
        &repo_path,
        &[
            "diff".into(),
            "--no-color".into(),
            format!("{base}...{head}"),
            "--".into(),
            file_path,
        ],
    )
}

fn read_json(repo_path: &str, args: &[String]) -> Result<Value, String> {
    let output = run_gh(repo_path, args)?;
    serde_json::from_str(&output).map_err(|error| error.to_string())
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").into()
}

fn unsigned(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn actor(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|actor| actor.get("login"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .into()
}

fn names(value: &Value, key: &str, nested_key: Option<&str>) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| match nested_key {
            Some(field) => entry.get(field).and_then(Value::as_str),
            None => entry.as_str(),
        })
        .map(str::to_owned)
        .collect()
}

fn get_repo_identity(repo_path: &str) -> Result<(String, String, String), String> {
    let value = read_json(
        repo_path,
        &strings(&["repo", "view", "--json", "owner,name,nameWithOwner"]),
    )?;
    Ok((
        actor(&value, "owner"),
        text(&value, "name"),
        text(&value, "nameWithOwner"),
    ))
}

#[tauri::command]
pub fn get_pull_requests(repo_path: String) -> Result<Vec<PullRequestInfo>, String> {
    let value = read_json(
        &repo_path,
        &strings(&[
            "pr",
            "list",
            "--state",
            "all",
            "--limit",
            LIST_LIMIT,
            "--json",
            "number,title,state,author,headRefName,url,updatedAt,labels",
        ]),
    )?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| PullRequestInfo {
            number: unsigned(row, "number"),
            title: text(row, "title"),
            state: text(row, "state"),
            author: actor(row, "author"),
            head_ref_name: text(row, "headRefName"),
            url: text(row, "url"),
            updated_at: text(row, "updatedAt"),
            labels: names(row, "labels", Some("name")),
        })
        .collect())
}

fn read_issue_parents(repo_path: &str) -> HashMap<u64, u64> {
    let mut parents = HashMap::new();
    let Ok((owner, name, _)) = get_repo_identity(repo_path) else {
        return parents;
    };
    let query = "query($owner:String!,$name:String!,$limit:Int!){repository(owner:$owner,name:$name){issues(first:$limit,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number parent{number}}}}}";
    let args = vec![
        "api".into(),
        "graphql".into(),
        "-f".into(),
        format!("query={query}"),
        "-f".into(),
        format!("owner={owner}"),
        "-f".into(),
        format!("name={name}"),
        "-F".into(),
        format!("limit={PARENT_LOOKUP_LIMIT}"),
    ];
    let Ok(value) = read_json(repo_path, &args) else {
        return parents;
    };
    let nodes = value
        .pointer("/data/repository/issues/nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten();
    for node in nodes {
        if let (Some(number), Some(parent)) = (
            node.get("number").and_then(Value::as_u64),
            node.pointer("/parent/number").and_then(Value::as_u64),
        ) {
            parents.insert(number, parent);
        }
    }
    parents
}

#[tauri::command]
pub fn get_issues(repo_path: String) -> Result<Vec<IssueInfo>, String> {
    let value = read_json(
        &repo_path,
        &strings(&[
            "issue",
            "list",
            "--state",
            "all",
            "--limit",
            LIST_LIMIT,
            "--json",
            "number,title,state,author,url,updatedAt,labels",
        ]),
    )?;
    let parents = read_issue_parents(&repo_path);
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| {
            let number = unsigned(row, "number");
            IssueInfo {
                number,
                title: text(row, "title"),
                state: text(row, "state"),
                author: actor(row, "author"),
                url: text(row, "url"),
                updated_at: text(row, "updatedAt"),
                labels: names(row, "labels", Some("name")),
                parent: parents.get(&number).copied().unwrap_or(0),
            }
        })
        .collect())
}

fn thread_detail(kind: &str, value: &Value) -> ThreadDetail {
    let comments = value
        .get("comments")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|comment| ThreadComment {
            author: actor(comment, "author"),
            created_at: text(comment, "createdAt"),
            body: text(comment, "body"),
        })
        .collect();
    ThreadDetail {
        kind: kind.into(),
        number: unsigned(value, "number"),
        title: text(value, "title"),
        state: text(value, "state"),
        author: actor(value, "author"),
        url: text(value, "url"),
        created_at: text(value, "createdAt"),
        updated_at: text(value, "updatedAt"),
        labels: names(value, "labels", Some("name")),
        assignees: names(value, "assignees", Some("login")),
        body: text(value, "body"),
        comments,
        base_ref_name: text(value, "baseRefName"),
        head_ref_name: text(value, "headRefName"),
        additions: unsigned(value, "additions"),
        deletions: unsigned(value, "deletions"),
        changed_files: unsigned(value, "changedFiles"),
    }
}

#[tauri::command]
pub fn get_pull_request_detail(repo_path: String, number: u64) -> Result<ThreadDetail, String> {
    let number = number_arg(number)?;
    let value = read_json(
    &repo_path,
    &[
      "pr".into(),
      "view".into(),
      number,
      "--json".into(),
      "number,title,state,author,url,createdAt,updatedAt,labels,assignees,body,comments,baseRefName,headRefName,additions,deletions,changedFiles".into(),
    ],
  )?;
    Ok(thread_detail("pr", &value))
}

#[tauri::command]
pub fn get_issue_detail(repo_path: String, number: u64) -> Result<ThreadDetail, String> {
    let number = number_arg(number)?;
    let value = read_json(
        &repo_path,
        &[
            "issue".into(),
            "view".into(),
            number,
            "--json".into(),
            "number,title,state,author,url,createdAt,updatedAt,labels,assignees,body,comments"
                .into(),
        ],
    )?;
    Ok(thread_detail("issue", &value))
}

#[tauri::command]
pub fn get_projects(repo_path: String) -> Result<ProjectListResult, String> {
    let (owner, _, name_with_owner) = get_repo_identity(&repo_path)?;
    let value = read_json(
        &repo_path,
        &[
            "project".into(),
            "list".into(),
            "--owner".into(),
            owner.clone(),
            "--limit".into(),
            LIST_LIMIT.into(),
            "--format".into(),
            "json".into(),
        ],
    )?;
    let projects = value
        .get("projects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|project| ProjectInfo {
            number: unsigned(project, "number"),
            title: text(project, "title"),
            url: text(project, "url"),
            closed: project
                .get("closed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            item_count: project
                .pointer("/items/totalCount")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        })
        .collect();
    Ok(ProjectListResult {
        owner,
        name_with_owner,
        projects,
    })
}

fn project_item(value: &Value, index: usize) -> ProjectItem {
    let content = value.get("content").unwrap_or(&Value::Null);
    let status = text(value, "status");
    ProjectItem {
        id: {
            let id = text(value, "id");
            if id.is_empty() {
                format!("item-{index}")
            } else {
                id
            }
        },
        title: {
            let title = text(value, "title");
            if title.is_empty() {
                let nested = text(content, "title");
                if nested.is_empty() {
                    "(untitled)".into()
                } else {
                    nested
                }
            } else {
                title
            }
        },
        status: if status.trim().is_empty() {
            NO_STATUS.into()
        } else {
            status
        },
        r#type: {
            let kind = text(content, "type");
            if kind.is_empty() {
                text(value, "type")
            } else {
                kind
            }
        },
        url: {
            let url = text(content, "url");
            if url.is_empty() {
                text(value, "url")
            } else {
                url
            }
        },
        number: unsigned(content, "number"),
        repository: text(content, "repository"),
        assignees: names(value, "assignees", None),
        labels: names(value, "labels", None),
    }
}

fn status_options(repo_path: &str, owner: &str, number: u64) -> Vec<String> {
    let Ok(number) = number_arg(number) else {
        return vec![];
    };
    let args = vec![
        "project".into(),
        "field-list".into(),
        number,
        "--owner".into(),
        owner.into(),
        "--limit".into(),
        FIELD_LIMIT.into(),
        "--format".into(),
        "json".into(),
    ];
    let Ok(value) = read_json(repo_path, &args) else {
        return vec![];
    };
    value
        .get("fields")
        .and_then(Value::as_array)
        .and_then(|fields| {
            fields
                .iter()
                .find(|field| text(field, "name").eq_ignore_ascii_case("status"))
        })
        .map(|field| names(field, "options", Some("name")))
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_project_board(
    repo_path: String,
    owner: String,
    number: u64,
) -> Result<ProjectBoard, String> {
    let number_arg = number_arg(number)?;
    let value = read_json(
        &repo_path,
        &[
            "project".into(),
            "item-list".into(),
            number_arg,
            "--owner".into(),
            owner.clone(),
            "--limit".into(),
            BOARD_ITEM_LIMIT.into(),
            "--format".into(),
            "json".into(),
        ],
    )?;
    let items: Vec<ProjectItem> = value
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(index, item)| project_item(item, index))
        .collect();
    Ok(ProjectBoard {
        columns: build_project_columns(items, status_options(&repo_path, &owner, number)),
    })
}

fn open_target(target: &str) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(target).status()
    } else if cfg!(windows) {
        Command::new("explorer.exe").arg(target).status()
    } else {
        Command::new("xdg-open").arg(target).status()
    }
    .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("opener exited with {status}"))
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https URLs can be opened.".into());
    }
    open_target(&url)
}

#[tauri::command]
pub fn list_opener_apps() -> Vec<OpenerApp> {
    let mut apps = vec![
        OpenerApp {
            id: "vscode".into(),
            label: "VS Code".into(),
        },
        OpenerApp {
            id: "file-manager".into(),
            label: if cfg!(target_os = "macos") {
                "Finder".into()
            } else {
                "File Explorer".into()
            },
        },
    ];
    if cfg!(target_os = "macos") {
        apps.push(OpenerApp {
            id: "terminal".into(),
            label: "Terminal".into(),
        });
        apps.push(OpenerApp {
            id: "iterm".into(),
            label: "iTerm".into(),
        });
    }
    apps
}

fn run_open_command(command: &str, args: &[&str]) -> Result<(), String> {
    let status = Command::new(command)
        .args(args)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{command} exited with {status}"))
    }
}

#[tauri::command]
pub fn open_in_app(target_path: String, app_id: String) -> Result<(), String> {
    match app_id.as_str() {
        "file-manager" => open_target(&target_path),
        "vscode" if cfg!(target_os = "macos") => {
            run_open_command("open", &["-a", "Visual Studio Code", &target_path])
        }
        "vscode" => run_open_command("code", &[&target_path]),
        "terminal" if cfg!(target_os = "macos") => {
            run_open_command("open", &["-a", "Terminal", &target_path])
        }
        "iterm" if cfg!(target_os = "macos") => {
            run_open_command("open", &["-a", "iTerm", &target_path])
        }
        _ => Err(format!("Unsupported app: {app_id}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    #[test]
    fn cli_resolution_skips_non_executable_files() {
        let root =
            env::temp_dir().join(format!("akbun-gitdesktop-cli-test-{}", std::process::id()));
        let blocked_dir = root.join("blocked");
        let executable_dir = root.join("executable");
        let command = "gitdesktop-cli-test";
        fs::create_dir_all(&blocked_dir).expect("create blocked directory");
        fs::create_dir_all(&executable_dir).expect("create executable directory");
        fs::write(blocked_dir.join(command), "blocked").expect("write blocked command");
        fs::write(executable_dir.join(command), "executable").expect("write executable command");
        fs::set_permissions(
            executable_dir.join(command),
            fs::Permissions::from_mode(0o755),
        )
        .expect("make command executable");
        let saved = env::var_os("PATH");
        env::set_var(
            "PATH",
            env::join_paths([&blocked_dir, &executable_dir]).expect("join test PATH"),
        );

        let resolved = resolve_cli(command);

        if let Some(value) = saved {
            env::set_var("PATH", value);
        }
        assert_eq!(resolved, executable_dir.join(command));
        fs::remove_dir_all(root).expect("remove test directory");
    }
}
