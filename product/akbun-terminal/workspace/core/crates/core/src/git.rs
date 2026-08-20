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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitEntry {
    pub path: String,
    pub status: FileStatus,
}

/// The answer for one folder. `repository` false means there is nothing to
/// colour, which is a normal answer rather than an error: most projects opened
/// in this app are repositories and some are not.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GitStatus {
    pub repository: bool,
    pub entries: Vec<GitEntry>,
}

impl GitStatus {
    fn none() -> Self {
        Self {
            repository: false,
            entries: Vec::new(),
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
    let mut strongest: Vec<(String, FileStatus)> = Vec::new();
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
        let mut current = root.join(relative);
        note(&mut strongest, &current, status);
        // Every folder between the file and the root wears it too.
        while let Some(parent) = current.parent().map(Path::to_path_buf) {
            if parent == root || !parent.starts_with(root) {
                break;
            }
            note(&mut strongest, &parent, status);
            current = parent;
        }
    }
    strongest.sort_by(|left, right| left.0.cmp(&right.0));
    strongest
        .into_iter()
        .map(|(path, status)| GitEntry { path, status })
        .collect()
}

fn note(into: &mut Vec<(String, FileStatus)>, path: &Path, status: FileStatus) {
    let path = path.to_string_lossy().to_string();
    match into.iter_mut().find(|(known, _)| *known == path) {
        Some(found) => {
            if status.rank() < found.1.rank() {
                found.1 = status;
            }
        }
        None => into.push((path, status)),
    }
}

/// The two letter code from `git status --porcelain`, as one colour.
///
/// Both columns are read, staged first, because a file staged and then changed
/// again is still the same row on screen and the louder half is the true one.
fn classify(code: &str) -> FileStatus {
    match code {
        "??" => FileStatus::Untracked,
        "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU" => FileStatus::Conflicted,
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
        status
            .entries
            .iter()
            .find(|entry| entry.path == path.to_string_lossy())
            .map(|entry| entry.status)
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
    fn the_staged_half_of_a_code_is_read_first() {
        assert_eq!(classify("??"), FileStatus::Untracked);
        assert_eq!(classify("UU"), FileStatus::Conflicted);
        assert_eq!(classify("AM"), FileStatus::Added);
        assert_eq!(classify(" M"), FileStatus::Modified);
        assert_eq!(classify("D "), FileStatus::Deleted);
        assert_eq!(classify("R "), FileStatus::Renamed);
    }
}
