//! What git thinks of the files in a folder.
//!
//! The browser on the right draws a repository, and a repository is never just a
//! list of names: the same folder means something different when three files in
//! it are modified and one is not tracked at all. This asks git itself rather
//! than reading `.git`, because the answer has to agree with what the shell in
//! the middle of the window prints, and the only thing that always agrees with
//! git is git.
//!
//! Two decisions are made here rather than in the shell, so a second view of the
//! same folder cannot disagree with this one.
//!
//! A change is also placed in the half of git it is sitting in. `git add` and an
//! edit that has not been added yet are two different states of one file, and a
//! browser that draws them the same way makes staging invisible from the pane
//! that is meant to show what happened.
//!
//! Directories carry the strongest status among the files under them. A closed
//! folder is the only thing on screen, and a folder that looks untouched while
//! something inside it is modified is worse than no colour at all.
//!
//! The base for the absolute paths comes from `--show-prefix` rather than
//! `--show-toplevel`. Both name the same directory, but the toplevel is the
//! resolved one, and the browser holds the path the user chose. On macOS those
//! two spellings differ as soon as a symlink is anywhere above the project, and
//! a path that does not match the row is a colour that never appears.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Conflicted,
    Deleted,
    Added,
    Modified,
    Renamed,
    Untracked,
}

impl FileStatus {
    /// Which status wins when a directory holds more than one. Lower is louder:
    /// a folder with a conflict in it should not be drawn as merely untracked.
    fn rank(self) -> u8 {
        match self {
            Self::Conflicted => 0,
            Self::Deleted => 1,
            Self::Added => 2,
            Self::Modified => 3,
            Self::Renamed => 4,
            Self::Untracked => 5,
        }
    }
}

/// Which half of git a change is sitting in.
///
/// The two columns of a porcelain code are two different states of the same
/// file, and a browser that shows only one of them tells a reader who has just
/// run `git add` that nothing happened. Carried beside the status rather than
/// folded into it, because "what changed" and "is it staged" are two questions
/// and every answer is a pair of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    /// In the index and nothing further in the working tree.
    Staged,
    /// In the working tree only. An untracked file is here too.
    Unstaged,
    /// Staged and then changed again, which is the state a commit would only
    /// half capture.
    Both,
}

impl Stage {
    fn of(code: &str) -> Self {
        // Untracked reports `??`, which is a working tree change and nothing in
        // the index however it is read.
        if code == "??" {
            return Self::Unstaged;
        }
        let mut letters = code.chars();
        let index = letters.next().unwrap_or(' ');
        let worktree = letters.next().unwrap_or(' ');
        // A conflict is written into both columns and belongs to neither half.
        if is_conflict(code) {
            return Self::Both;
        }
        match (index != ' ', worktree != ' ') {
            (true, true) => Self::Both,
            (false, true) => Self::Unstaged,
            _ => Self::Staged,
        }
    }

    /// What a directory wears when two children disagree. A folder holding one
    /// staged file and one that is not is both.
    fn merged(self, other: Self) -> Self {
        if self == other {
            self
        } else {
            Self::Both
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitEntry {
    pub path: String,
    pub status: FileStatus,
    pub stage: Stage,
}

/// The answer for one folder. `repository` false means there is nothing to
/// colour, which is a normal answer rather than an error: most projects opened
/// in this app are repositories and some are not.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitStatus {
    pub repository: bool,
    pub entries: Vec<GitEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub refs: Vec<String>,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitLog {
    pub repository: bool,
    pub commits: Vec<GitCommit>,
}

impl GitLog {
    fn none() -> Self {
        Self {
            repository: false,
            commits: Vec::new(),
        }
    }
}

impl GitStatus {
    fn none() -> Self {
        Self {
            repository: false,
            entries: Vec::new(),
        }
    }
}

/// One file inside a commit, with the patch for that file alone.
///
/// The patch is split per file here rather than handed over as one blob,
/// because the panel draws a list of files and lets a reader open one of them.
/// Splitting once in the core is what keeps the shell from parsing a diff.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitDiffFile {
    pub path: String,
    pub status: FileStatus,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
}

/// What one commit did. `body` is the message below the subject, which the log
/// panel has no room for and a commit view is the place for.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitCommitDetail {
    pub commit: GitCommit,
    pub body: String,
    pub files: Vec<GitDiffFile>,
}

/// One stash, named the way `git stash apply` wants it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitStashEntry {
    /// The selector, such as stash@{0}.
    pub name: String,
    pub subject: String,
}

/// What is waiting in the repository right now: the index, the working tree,
/// and the stash.
///
/// Kept apart from `GitStatus` even though both read the same porcelain. Status
/// answers "what colour is this row" and rolls directories up; this answers
/// "what would a commit capture", which is a list of files and nothing above
/// them. A file staged and then edited again is in both lists, because that is
/// the state it is actually in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitWorking {
    pub repository: bool,
    pub staged: Vec<GitEntry>,
    pub unstaged: Vec<GitEntry>,
    pub stash: Vec<GitStashEntry>,
}

impl GitWorking {
    fn none() -> Self {
        Self {
            repository: false,
            staged: Vec::new(),
            unstaged: Vec::new(),
            stash: Vec::new(),
        }
    }
}

/// Every changed path under the repository holding `path`, directories included.
///
/// Never an error. git missing, a folder that is not a repository and a
/// repository too broken to answer all mean the same thing to a file browser:
/// draw the names in the ordinary colour.
pub fn status(path: &str) -> GitStatus {
    let Some(root) = repository_root(path) else {
        return GitStatus::none();
    };
    let Some(porcelain) = run(path, &["status", "--porcelain", "-z", "--untracked-files=all"])
    else {
        return GitStatus::none();
    };
    GitStatus {
        repository: true,
        entries: entries(&root, &porcelain),
    }
}

/// The recent branch, remote and tag history in topological order.
///
/// A bounded answer keeps the panel quick in repositories with a long history.
/// An unborn repository is still a repository; it returns an empty commit list.
pub fn log(path: &str) -> GitLog {
    if repository_root(path).is_none() {
        return GitLog::none();
    }
    let mut arguments = vec!["log"];
    // A detached HEAD is not covered by any of the ref selectors below. Add it
    // only when it names a commit: an unborn repository has no HEAD yet, and
    // `git log --branches --remotes --tags` answers it successfully with no rows.
    if run(path, &["rev-parse", "--verify", "HEAD^{commit}"]).is_some() {
        arguments.push("HEAD");
    }
    arguments.extend([
        "--branches",
        "--remotes",
        "--tags",
        "--topo-order",
        "--max-count=200",
        "--date=format:%Y-%m-%d %H:%M",
        "--pretty=format:%H%x1f%P%x1f%an%x1f%ad%x1f%D%x1f%s%x1e",
    ]);
    let Some(output) = run(path, &arguments) else {
        // This is not the unborn case: that command succeeds with no rows.
        // Corruption, permissions and every other failure make history
        // unavailable rather than pretending that the repository is empty.
        return GitLog::none();
    };
    GitLog {
        repository: true,
        commits: parse_log(&output),
    }
}

fn parse_log(output: &str) -> Vec<GitCommit> {
    output
        .split('\u{1e}')
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim_matches(['\n', '\r']).split('\u{1f}').collect();
            if fields.len() != 6 || fields[0].is_empty() {
                return None;
            }
            Some(GitCommit {
                hash: fields[0].to_string(),
                parents: fields[1]
                    .split_whitespace()
                    .map(str::to_string)
                    .collect(),
                author: fields[2].to_string(),
                date: fields[3].to_string(),
                refs: fields[4]
                    .split(", ")
                    .filter(|name| !name.is_empty())
                    .map(str::to_string)
                    .collect(),
                subject: fields[5].to_string(),
            })
        })
        .collect()
}

/// The repository root, spelled the way the caller spells `path`.
fn repository_root(path: &str) -> Option<PathBuf> {
    let output = run(path, &["rev-parse", "--show-prefix"])?;
    // An empty prefix means `path` is the root itself.
    let depth = output
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .count();
    let mut root = PathBuf::from(path);
    for _ in 0..depth {
        root = root.parent()?.to_path_buf();
    }
    Some(root)
}

fn run(directory: &str, arguments: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_string())
}

/// Reads `--porcelain -z` and rolls the answer up the directory tree.
fn entries(root: &Path, porcelain: &str) -> Vec<GitEntry> {
    let mut records = porcelain.split('\0').filter(|record| !record.is_empty());
    let mut strongest: Vec<(String, FileStatus, Stage)> = Vec::new();
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let code = &record[..2];
        let relative = &record[3..];
        // A rename carries its old path as the record after it. Reading it here
        // is what keeps the next loop aligned with the start of a record.
        if code.starts_with('R') || code.starts_with('C') {
            records.next();
        }
        let status = classify(code);
        let stage = Stage::of(code);
        let mut current = root.join(relative);
        note(&mut strongest, &current, status, stage);
        // Every folder between the file and the root wears it too.
        while let Some(parent) = current.parent().map(Path::to_path_buf) {
            if parent == root || !parent.starts_with(root) {
                break;
            }
            note(&mut strongest, &parent, status, stage);
            current = parent;
        }
    }
    strongest.sort_by(|left, right| left.0.cmp(&right.0));
    strongest
        .into_iter()
        .map(|(path, status, stage)| GitEntry {
            path,
            status,
            stage,
        })
        .collect()
}

fn note(into: &mut Vec<(String, FileStatus, Stage)>, path: &Path, status: FileStatus, stage: Stage) {
    let path = path.to_string_lossy().to_string();
    match into.iter_mut().find(|(known, _, _)| *known == path) {
        Some(found) => {
            if status.rank() < found.1.rank() {
                found.1 = status;
            }
            found.2 = found.2.merged(stage);
        }
        None => into.push((path, status, stage)),
    }
}

fn is_conflict(code: &str) -> bool {
    matches!(code, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU")
}

/// The two letter code from `git status --porcelain`, as one colour.
///
/// Both columns are read, staged first, because a file staged and then changed
/// again is still the same row on screen and the louder half is the true one.
fn classify(code: &str) -> FileStatus {
    match code {
        "??" => FileStatus::Untracked,
        code if is_conflict(code) => FileStatus::Conflicted,
        _ => {
            let letters: Vec<char> = code.chars().collect();
            for letter in letters {
                match letter {
                    'D' => return FileStatus::Deleted,
                    'A' => return FileStatus::Added,
                    'R' | 'C' => return FileStatus::Renamed,
                    'M' | 'T' => return FileStatus::Modified,
                    _ => continue,
                }
            }
            FileStatus::Modified
        }
    }
}

/// What one commit did, or nothing when `hash` names no commit here.
///
/// The hash is checked against hex before it reaches git, because it arrives
/// from the shell and a value starting with a dash would otherwise be read as
/// an option rather than a revision.
pub fn show(path: &str, hash: &str) -> Option<GitCommitDetail> {
    if !is_revision(hash) {
        return None;
    }
    repository_root(path)?;
    let header = run(
        path,
        &[
            "show",
            "--quiet",
            "--date=format:%Y-%m-%d %H:%M",
            "--format=%H%x1f%P%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%b",
            hash,
        ],
    )?;
    let commit = parse_commit_header(&header)?;
    // A merge shows nothing by default, so the diff is asked for against the
    // first parent: that is the change the branch brought in, which is what a
    // reader clicking a merge row is looking for.
    let patch = run(
        path,
        &[
            "show",
            "--format=",
            "--no-color",
            "--first-parent",
            "-m",
            hash,
        ],
    )
    .unwrap_or_default();
    Some(GitCommitDetail {
        files: split_patch(&patch),
        body: commit.1,
        commit: commit.0,
    })
}

/// The index, the working tree and the stash as they stand.
///
/// Never an error, for the same reason `status` is not: a pane that cannot ask
/// git still has to draw something, and "nothing waiting" is the honest answer
/// for a folder that is not a repository.
pub fn working(path: &str) -> GitWorking {
    let Some(root) = repository_root(path) else {
        return GitWorking::none();
    };
    let Some(porcelain) = run(path, &["status", "--porcelain", "-z", "--untracked-files=all"])
    else {
        return GitWorking::none();
    };
    let (staged, unstaged) = halves(&root, &porcelain);
    GitWorking {
        repository: true,
        staged,
        unstaged,
        stash: stash(path),
    }
}

fn stash(path: &str) -> Vec<GitStashEntry> {
    let Some(output) = run(path, &["stash", "list", "--format=%gd%x1f%gs"]) else {
        return Vec::new();
    };
    output
        .lines()
        .filter_map(|line| {
            let (name, subject) = line.split_once('\u{1f}')?;
            (!name.is_empty()).then(|| GitStashEntry {
                name: name.to_string(),
                subject: subject.to_string(),
            })
        })
        .collect()
}

/// Splits the porcelain into the two lists a commit would and would not
/// capture. Each column of the code is read on its own, because a file added
/// and then edited again is `A` in one list and `M` in the other, and reading
/// only the louder half loses one of them.
fn halves(root: &Path, porcelain: &str) -> (Vec<GitEntry>, Vec<GitEntry>) {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut records = porcelain.split('\0').filter(|record| !record.is_empty());
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let code = &record[..2];
        let path = root.join(&record[3..]).to_string_lossy().to_string();
        // A rename carries its old path as the record after it, which is not a
        // status line of its own.
        if code.starts_with('R') || code.starts_with('C') {
            records.next();
        }
        if is_conflict(code) {
            // A conflict is not resolved by staging half of it, so it is shown
            // in the half a reader has to act in.
            unstaged.push(GitEntry {
                path,
                status: FileStatus::Conflicted,
                stage: Stage::Both,
            });
            continue;
        }
        let mut letters = code.chars();
        let index = letters.next().unwrap_or(' ');
        let worktree = letters.next().unwrap_or(' ');
        if index != ' ' && index != '?' {
            staged.push(GitEntry {
                path: path.clone(),
                status: letter(index),
                stage: Stage::Staged,
            });
        }
        if worktree != ' ' {
            unstaged.push(GitEntry {
                path,
                status: letter(worktree),
                stage: Stage::Unstaged,
            });
        }
    }
    staged.sort_by(|left, right| left.path.cmp(&right.path));
    unstaged.sort_by(|left, right| left.path.cmp(&right.path));
    (staged, unstaged)
}

fn letter(code: char) -> FileStatus {
    match code {
        '?' => FileStatus::Untracked,
        'D' => FileStatus::Deleted,
        'A' => FileStatus::Added,
        'R' | 'C' => FileStatus::Renamed,
        _ => FileStatus::Modified,
    }
}

/// A hash the shell can send. Only what `git log` hands out, which is hex, so
/// nothing that looks like an option or a path reaches the command line.
fn is_revision(hash: &str) -> bool {
    (4..=64).contains(&hash.len()) && hash.chars().all(|letter| letter.is_ascii_hexdigit())
}

/// The commit and its message body, from the seven fields `show` was asked for.
fn parse_commit_header(output: &str) -> Option<(GitCommit, String)> {
    let fields: Vec<&str> = output.trim_matches(['\n', '\r']).split('\u{1f}').collect();
    if fields.len() != 7 || fields[0].is_empty() {
        return None;
    }
    let commit = GitCommit {
        hash: fields[0].to_string(),
        parents: fields[1].split_whitespace().map(str::to_string).collect(),
        author: fields[2].to_string(),
        date: fields[3].to_string(),
        refs: fields[4]
            .split(", ")
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect(),
        subject: fields[5].to_string(),
    };
    Some((commit, fields[6].trim_matches(['\n', '\r']).to_string()))
}

/// Cuts a unified diff at each `diff --git` line and reads each piece.
///
/// The counts come from the piece rather than from a second `--numstat` call,
/// so the numbers on a row and the lines under it can never disagree.
fn split_patch(patch: &str) -> Vec<GitDiffFile> {
    let mut files: Vec<GitDiffFile> = Vec::new();
    let mut current: Option<Vec<&str>> = None;
    for line in patch.lines() {
        if line.starts_with("diff --git ") {
            if let Some(lines) = current.take() {
                files.extend(read_patch(&lines));
            }
            current = Some(vec![line]);
            continue;
        }
        if let Some(lines) = current.as_mut() {
            lines.push(line);
        }
    }
    if let Some(lines) = current {
        files.extend(read_patch(&lines));
    }
    files
}

fn read_patch(lines: &[&str]) -> Option<GitDiffFile> {
    let mut status = FileStatus::Modified;
    let mut before: Option<String> = None;
    let mut after: Option<String> = None;
    let mut additions = 0;
    let mut deletions = 0;
    let mut in_body = false;
    for line in lines {
        if line.starts_with("@@") {
            in_body = true;
        }
        if !in_body {
            if line.starts_with("new file mode") {
                status = FileStatus::Added;
            } else if line.starts_with("deleted file mode") {
                status = FileStatus::Deleted;
            } else if line.starts_with("rename from") {
                status = FileStatus::Renamed;
            } else if let Some(path) = line.strip_prefix("--- ") {
                before = strip_side(path);
            } else if let Some(path) = line.strip_prefix("+++ ") {
                after = strip_side(path);
            }
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    // A deleted file has no `+++` side, and a binary change has neither; the
    // `diff --git` line is the last thing that still names it.
    let path = after.or(before).or_else(|| header_path(lines.first()?))?;
    Some(GitDiffFile {
        path,
        status,
        additions,
        deletions,
        patch: lines.join("\n"),
    })
}

/// `a/src/main.rs` as `src/main.rs`. `/dev/null` is the missing side of an add
/// or a delete and names no file.
fn strip_side(path: &str) -> Option<String> {
    let path = path.split('\t').next().unwrap_or(path);
    if path == "/dev/null" {
        return None;
    }
    Some(
        path.strip_prefix("a/")
            .or_else(|| path.strip_prefix("b/"))
            .unwrap_or(path)
            .to_string(),
    )
}

/// The second half of `diff --git a/x b/x`, for a piece that carries no `+++`.
fn header_path(header: &str) -> Option<String> {
    let rest = header.strip_prefix("diff --git ")?;
    let (_, second) = rest.split_once(" b/")?;
    Some(second.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    fn temp_directory() -> PathBuf {
        let unique = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "akbun-terminal-git-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    /// A repository with one commit in it. Returns nothing when git is not
    /// installed, which is what lets these tests be skipped rather than fail on
    /// a machine that cannot run them at all.
    fn repository() -> Option<PathBuf> {
        let directory = temp_directory();
        let path = directory.to_str().unwrap();
        run(path, &["init", "--initial-branch=main"])?;
        run(path, &["config", "user.email", "test@example.com"])?;
        run(path, &["config", "user.name", "Test"])?;
        fs::write(directory.join("kept.txt"), "one\n").unwrap();
        run(path, &["add", "."])?;
        run(path, &["commit", "-m", "first"])?;
        Some(directory)
    }

    fn status_of(status: &GitStatus, path: &Path) -> Option<FileStatus> {
        entry_of(status, path).map(|entry| entry.status)
    }

    fn stage_of(status: &GitStatus, path: &Path) -> Option<Stage> {
        entry_of(status, path).map(|entry| entry.stage)
    }

    fn entry_of<'a>(status: &'a GitStatus, path: &Path) -> Option<&'a GitEntry> {
        status
            .entries
            .iter()
            .find(|entry| entry.path == path.to_string_lossy())
    }

    #[test]
    fn a_folder_outside_a_repository_has_nothing_to_colour() {
        let directory = temp_directory();
        let status = status(directory.to_str().unwrap());
        assert!(!status.repository);
        assert!(status.entries.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_modified_added_and_untracked_files() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        fs::write(directory.join("fresh.txt"), "new\n").unwrap();
        fs::write(directory.join("staged.txt"), "new\n").unwrap();
        run(path, &["add", "staged.txt"]).unwrap();

        let status = status(path);
        assert!(status.repository);
        assert_eq!(status_of(&status, &directory.join("kept.txt")), Some(FileStatus::Modified));
        assert_eq!(status_of(&status, &directory.join("fresh.txt")), Some(FileStatus::Untracked));
        assert_eq!(status_of(&status, &directory.join("staged.txt")), Some(FileStatus::Added));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_folder_wears_the_loudest_status_under_it() {
        // The closed folder is all that is on screen, so what is inside it has
        // to reach the row that hides it.
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        let nested = directory.join("src").join("deep");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("a.txt"), "new\n").unwrap();
        fs::write(directory.join("src").join("b.txt"), "new\n").unwrap();
        run(path, &["add", "src/b.txt"]).unwrap();

        let status = status(path);
        // Added beats untracked, and both reach the top folder.
        assert_eq!(status_of(&status, &directory.join("src")), Some(FileStatus::Added));
        assert_eq!(status_of(&status, &nested), Some(FileStatus::Untracked));
        assert_eq!(status_of(&status, &nested.join("a.txt")), Some(FileStatus::Untracked));
        // The root itself is not an entry; nothing draws it.
        assert_eq!(status_of(&status, &directory), None);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_rename_is_one_entry_and_does_not_shift_the_next_one() {
        // The old path arrives as a record of its own. Reading it as a status
        // line is what used to colour the wrong file.
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::rename(directory.join("kept.txt"), directory.join("moved.txt")).unwrap();
        run(path, &["add", "-A"]).unwrap();
        fs::write(directory.join("later.txt"), "new\n").unwrap();

        let status = status(path);
        assert_eq!(status_of(&status, &directory.join("moved.txt")), Some(FileStatus::Renamed));
        assert_eq!(status_of(&status, &directory.join("later.txt")), Some(FileStatus::Untracked));
        assert_eq!(status_of(&status, &directory.join("kept.txt")), None);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_subdirectory_is_answered_against_its_own_repository() {
        // The browser asks about the folder it was pointed at, which is not
        // always the root, and the paths still have to match its rows.
        let Some(directory) = repository() else { return };
        let inner = directory.join("app");
        fs::create_dir_all(&inner).unwrap();
        fs::write(inner.join("c.txt"), "new\n").unwrap();

        let status = status(inner.to_str().unwrap());
        assert!(status.repository);
        assert_eq!(status_of(&status, &inner.join("c.txt")), Some(FileStatus::Untracked));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_added_file_is_told_from_one_that_is_only_edited() {
        // The reason this exists: after `git add` the row has to change, and
        // before this it did not.
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        fs::write(directory.join("staged.txt"), "new\n").unwrap();
        fs::write(directory.join("both.txt"), "new\n").unwrap();
        run(path, &["add", "staged.txt", "both.txt"]).unwrap();
        fs::write(directory.join("both.txt"), "changed again\n").unwrap();

        let status = status(path);
        assert_eq!(stage_of(&status, &directory.join("kept.txt")), Some(Stage::Unstaged));
        assert_eq!(stage_of(&status, &directory.join("staged.txt")), Some(Stage::Staged));
        assert_eq!(stage_of(&status, &directory.join("both.txt")), Some(Stage::Both));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_folder_holding_both_halves_wears_both() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        let inner = directory.join("src");
        fs::create_dir_all(&inner).unwrap();
        fs::write(inner.join("added.txt"), "new\n").unwrap();
        fs::write(inner.join("loose.txt"), "new\n").unwrap();
        run(path, &["add", "src/added.txt"]).unwrap();

        let status = status(path);
        assert_eq!(stage_of(&status, &inner.join("added.txt")), Some(Stage::Staged));
        assert_eq!(stage_of(&status, &inner.join("loose.txt")), Some(Stage::Unstaged));
        assert_eq!(stage_of(&status, &inner), Some(Stage::Both));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn each_half_of_a_code_is_read_for_the_stage() {
        assert_eq!(Stage::of("??"), Stage::Unstaged);
        assert_eq!(Stage::of("A "), Stage::Staged);
        assert_eq!(Stage::of(" M"), Stage::Unstaged);
        assert_eq!(Stage::of("AM"), Stage::Both);
        assert_eq!(Stage::of("UU"), Stage::Both);
    }

    #[test]
    fn reads_commits_and_refs_in_topological_order() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        run(path, &["tag", "first-release"]).unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        run(path, &["add", "kept.txt"]).unwrap();
        run(path, &["commit", "-m", "second"]).unwrap();

        let history = log(path);
        assert!(history.repository);
        assert_eq!(history.commits.len(), 2);
        assert_eq!(history.commits[0].subject, "second");
        assert_eq!(history.commits[0].parents, vec![history.commits[1].hash.clone()]);
        assert!(history.commits[1].refs.iter().any(|name| name == "tag: first-release"));
        assert_eq!(history.commits[0].author, "Test");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_unborn_repository_has_an_empty_log() {
        let directory = temp_directory();
        let path = directory.to_str().unwrap();
        run(path, &["init", "--initial-branch=main"]).unwrap();

        let history = log(path);
        assert!(history.repository);
        assert!(history.commits.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_detached_head_is_in_the_log() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        run(path, &["checkout", "--detach"]).unwrap();
        fs::write(directory.join("kept.txt"), "detached\n").unwrap();
        run(path, &["add", "kept.txt"]).unwrap();
        run(path, &["commit", "-m", "detached work"]).unwrap();

        let history = log(path);
        assert_eq!(history.commits.first().map(|commit| commit.subject.as_str()), Some("detached work"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_folder_outside_a_repository_has_no_log() {
        let directory = temp_directory();
        let history = log(directory.to_str().unwrap());
        assert!(!history.repository);
        assert!(history.commits.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_broken_object_does_not_look_like_an_empty_repository() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        let head = run(path, &["rev-parse", "HEAD"]).unwrap();
        let head = head.trim();
        fs::remove_file(directory.join(".git/objects").join(&head[..2]).join(&head[2..])).unwrap();

        let history = log(path);
        assert!(!history.repository);
        assert!(history.commits.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_commit_carries_its_body_and_one_patch_per_file() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        fs::write(directory.join("fresh.txt"), "new\n").unwrap();
        run(path, &["add", "-A"]).unwrap();
        run(path, &["commit", "-m", "second", "-m", "why it happened"]).unwrap();
        let head = run(path, &["rev-parse", "HEAD"]).unwrap();

        let detail = show(path, head.trim()).unwrap();
        assert_eq!(detail.commit.subject, "second");
        assert_eq!(detail.body, "why it happened");
        let mut paths: Vec<&str> = detail.files.iter().map(|file| file.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, vec!["fresh.txt", "kept.txt"]);
        let fresh = detail.files.iter().find(|file| file.path == "fresh.txt").unwrap();
        assert_eq!(fresh.status, FileStatus::Added);
        assert_eq!((fresh.additions, fresh.deletions), (1, 0));
        assert!(fresh.patch.contains("+new"));
        let kept = detail.files.iter().find(|file| file.path == "kept.txt").unwrap();
        assert_eq!((kept.additions, kept.deletions), (1, 1));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_hash_that_is_not_a_hash_never_reaches_git() {
        // The shell sends this, so a value that would be read as an option has
        // to be refused before it becomes a command line argument.
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        assert!(show(path, "--help").is_none());
        assert!(show(path, "HEAD").is_none());
        assert!(show(path, "0123456789abcdef0123456789abcdef01234567").is_none());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_deleted_file_is_named_by_the_side_that_still_has_it() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::remove_file(directory.join("kept.txt")).unwrap();
        run(path, &["add", "-A"]).unwrap();
        run(path, &["commit", "-m", "gone"]).unwrap();
        let head = run(path, &["rev-parse", "HEAD"]).unwrap();

        let detail = show(path, head.trim()).unwrap();
        assert_eq!(detail.files.len(), 1);
        assert_eq!(detail.files[0].path, "kept.txt");
        assert_eq!(detail.files[0].status, FileStatus::Deleted);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn each_half_of_the_repository_is_listed_on_its_own() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        fs::write(directory.join("staged.txt"), "new\n").unwrap();
        fs::write(directory.join("both.txt"), "new\n").unwrap();
        fs::write(directory.join("loose.txt"), "new\n").unwrap();
        run(path, &["add", "staged.txt", "both.txt"]).unwrap();
        fs::write(directory.join("both.txt"), "changed again\n").unwrap();

        let working = working(path);
        assert!(working.repository);
        let staged: Vec<&str> = working.staged.iter().map(|entry| entry.path.as_str()).collect();
        let unstaged: Vec<&str> = working
            .unstaged
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();
        let name = |file: &str| directory.join(file).to_string_lossy().to_string();
        assert_eq!(staged, vec![name("both.txt"), name("staged.txt")]);
        assert_eq!(unstaged, vec![name("both.txt"), name("kept.txt"), name("loose.txt")]);
        // The file added and then edited again is in both lists, and each list
        // says what that half of git holds.
        let both = working.staged.iter().find(|entry| entry.path == name("both.txt")).unwrap();
        assert_eq!(both.status, FileStatus::Added);
        let loose = working.unstaged.iter().find(|entry| entry.path == name("loose.txt")).unwrap();
        assert_eq!(loose.status, FileStatus::Untracked);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_stash_is_listed_by_the_name_that_applies_it() {
        let Some(directory) = repository() else { return };
        let path = directory.to_str().unwrap();
        fs::write(directory.join("kept.txt"), "two\n").unwrap();
        run(path, &["stash", "push", "-m", "later"]).unwrap();

        let working = working(path);
        assert_eq!(working.stash.len(), 1);
        assert_eq!(working.stash[0].name, "stash@{0}");
        assert!(working.stash[0].subject.contains("later"));
        // Stashing put the working tree back, so neither half holds anything.
        assert!(working.staged.is_empty());
        assert!(working.unstaged.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_folder_outside_a_repository_has_nothing_waiting() {
        let directory = temp_directory();
        let working = working(directory.to_str().unwrap());
        assert!(!working.repository);
        assert!(working.staged.is_empty());
        assert!(working.stash.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn the_staged_half_of_a_code_is_read_first() {
        assert_eq!(classify("??"), FileStatus::Untracked);
        assert_eq!(classify("UU"), FileStatus::Conflicted);
        assert_eq!(classify("AM"), FileStatus::Added);
        assert_eq!(classify(" M"), FileStatus::Modified);
        assert_eq!(classify("D "), FileStatus::Deleted);
        assert_eq!(classify("R "), FileStatus::Renamed);
    }
}
