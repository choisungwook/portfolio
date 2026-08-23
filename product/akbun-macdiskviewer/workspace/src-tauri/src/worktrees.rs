use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub repository: String,
    pub repository_path: String,
    pub branch: String,
    pub size_bytes: i64,
    pub modified_ms: i64,
    pub descendants: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeCatalog {
    pub items: Vec<WorktreeEntry>,
    pub count: usize,
    pub total_size_bytes: i64,
}

struct Candidate {
    git_marker: String,
    marker_kind: String,
    root: String,
    size_bytes: i64,
    modified_ms: i64,
    descendants: i64,
}

pub fn discover(database_path: &Path) -> Result<WorktreeCatalog, String> {
    if !database_path.exists() {
        return Ok(WorktreeCatalog {
            items: Vec::new(),
            count: 0,
            total_size_bytes: 0,
        });
    }
    let database = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(error_text)?;
    let mut statement = database
        .prepare(
            "SELECT marker.path, marker.kind, root.path, root.size_bytes, root.modified_ms,
                    root.descendants
       FROM entries marker
       JOIN entries root ON root.path = marker.parent_path
       WHERE marker.name = '.git' AND marker.kind IN ('file', 'directory')",
        )
        .map_err(error_text)?;
    let candidates = statement
        .query_map([], |row| {
            Ok(Candidate {
                git_marker: row.get(0)?,
                marker_kind: row.get(1)?,
                root: row.get(2)?,
                size_bytes: row.get(3)?,
                modified_ms: row.get(4)?,
                descendants: row.get(5)?,
            })
        })
        .map_err(error_text)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error_text)?;
    let mut items = candidates
        .iter()
        .filter_map(read_candidate)
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .size_bytes
            .cmp(&left.size_bytes)
            .then_with(|| left.path.cmp(&right.path))
    });
    items.dedup_by(|left, right| left.path == right.path);
    let total_size_bytes = items
        .iter()
        .fold(0_i64, |total, item| total.saturating_add(item.size_bytes));
    Ok(WorktreeCatalog {
        count: items.len(),
        items,
        total_size_bytes,
    })
}

fn read_candidate(candidate: &Candidate) -> Option<WorktreeEntry> {
    let root = Path::new(&candidate.root);
    let marker = Path::new(&candidate.git_marker);
    let (git_dir, repository_path) = if candidate.marker_kind == "directory" {
        if !marker.is_dir() || !root.is_dir() {
            return None;
        }
        (marker.to_path_buf(), root.to_path_buf())
    } else {
        let git_dir = parse_git_dir(marker, root)?;
        let common_dir = common_directory(&git_dir)?;
        let repository_path = if common_dir.file_name().is_some_and(|name| name == ".git") {
            common_dir.parent()?.to_path_buf()
        } else {
            common_dir
        };
        (git_dir, repository_path)
    };
    let repository = repository_path.file_name().map_or_else(
        || repository_path.to_string_lossy().into_owned(),
        |name| name.to_string_lossy().into_owned(),
    );
    let branch = read_branch(&git_dir);
    Some(WorktreeEntry {
        path: candidate.root.clone(),
        repository,
        repository_path: repository_path.to_string_lossy().into_owned(),
        branch,
        size_bytes: candidate.size_bytes,
        modified_ms: candidate.modified_ms,
        descendants: candidate.descendants,
    })
}

fn parse_git_dir(marker: &Path, root: &Path) -> Option<PathBuf> {
    let contents = fs::read_to_string(marker).ok()?;
    let value = contents.lines().next()?.strip_prefix("gitdir:")?.trim();
    let path = PathBuf::from(value);
    let resolved = if path.is_absolute() {
        path
    } else {
        root.join(path)
    };
    resolved.canonicalize().ok()
}

fn common_directory(git_dir: &Path) -> Option<PathBuf> {
    let value = fs::read_to_string(git_dir.join("commondir")).ok()?;
    let path = PathBuf::from(value.trim());
    let resolved = if path.is_absolute() {
        path
    } else {
        git_dir.join(path)
    };
    resolved.canonicalize().ok()
}

fn read_branch(git_dir: &Path) -> String {
    let head = fs::read_to_string(git_dir.join("HEAD")).unwrap_or_default();
    let value = head.trim();
    value.strip_prefix("ref: refs/heads/").map_or_else(
        || value.chars().take(12).collect::<String>(),
        ToOwned::to_owned,
    )
}

fn error_text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::tempdir;

    #[test]
    fn discovers_linked_worktrees_from_the_disk_index() {
        let directory = tempdir().unwrap();
        let repository = directory.path().join("portfolio");
        let git_dir = repository.join(".git/worktrees/agent-1");
        let worktree = directory.path().join("agent-worktree");
        fs::create_dir_all(&git_dir).unwrap();
        fs::create_dir_all(&worktree).unwrap();
        fs::write(git_dir.join("commondir"), "../..\n").unwrap();
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/codex/feature\n").unwrap();
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();

        let database_path = directory.path().join("catalog.sqlite");
        let database = Connection::open(&database_path).unwrap();
        database
            .execute_batch(
                "CREATE TABLE entries (
        path TEXT PRIMARY KEY, parent_path TEXT, name TEXT NOT NULL, kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, logical_bytes INTEGER NOT NULL,
        modified_ms INTEGER NOT NULL, descendants INTEGER NOT NULL DEFAULT 0
      );",
            )
            .unwrap();
        database
            .execute(
                "INSERT INTO entries VALUES (?, NULL, ?, 'directory', 4096, 4096, 1234, 20)",
                params![worktree.to_string_lossy(), "agent-worktree"],
            )
            .unwrap();
        database
            .execute(
                "INSERT INTO entries VALUES (?, ?, '.git', 'file', 0, 64, 1234, 0)",
                params![
                    worktree.join(".git").to_string_lossy(),
                    worktree.to_string_lossy()
                ],
            )
            .unwrap();
        drop(database);

        let catalog = discover(&database_path).unwrap();
        assert_eq!(catalog.count, 1);
        assert_eq!(catalog.total_size_bytes, 4096);
        assert_eq!(catalog.items[0].repository, "portfolio");
        assert_eq!(catalog.items[0].branch, "codex/feature");
        assert_eq!(catalog.items[0].path, worktree.to_string_lossy());
    }

    #[test]
    fn discovers_regular_git_repositories_from_the_disk_index() {
        let directory = tempdir().unwrap();
        let repository = directory.path().join("projects/sample-repository");
        let git_dir = repository.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();

        let database_path = directory.path().join("catalog.sqlite");
        let database = Connection::open(&database_path).unwrap();
        database
            .execute_batch(
                "CREATE TABLE entries (
        path TEXT PRIMARY KEY, parent_path TEXT, name TEXT NOT NULL, kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, logical_bytes INTEGER NOT NULL,
        modified_ms INTEGER NOT NULL, descendants INTEGER NOT NULL DEFAULT 0
      );",
            )
            .unwrap();
        database
            .execute(
                "INSERT INTO entries VALUES (?, NULL, ?, 'directory', 8192, 8192, 5678, 30)",
                params![repository.to_string_lossy(), "sample-repository"],
            )
            .unwrap();
        database
            .execute(
                "INSERT INTO entries VALUES (?, ?, '.git', 'directory', 1024, 1024, 5678, 5)",
                params![git_dir.to_string_lossy(), repository.to_string_lossy()],
            )
            .unwrap();
        drop(database);

        let catalog = discover(&database_path).unwrap();
        assert_eq!(catalog.count, 1);
        assert_eq!(catalog.total_size_bytes, 8192);
        assert_eq!(catalog.items[0].repository, "sample-repository");
        assert_eq!(catalog.items[0].branch, "main");
        assert_eq!(catalog.items[0].path, repository.to_string_lossy());
        assert_eq!(
            catalog.items[0].repository_path,
            repository.to_string_lossy()
        );
    }

    #[test]
    fn ignores_git_markers_missing_from_the_filesystem() {
        let directory = tempdir().unwrap();
        let database_path = directory.path().join("catalog.sqlite");
        let database = Connection::open(&database_path).unwrap();
        database
            .execute_batch(
                "CREATE TABLE entries (
        path TEXT PRIMARY KEY, parent_path TEXT, name TEXT NOT NULL, kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, logical_bytes INTEGER NOT NULL,
        modified_ms INTEGER NOT NULL, descendants INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO entries VALUES ('/repo', NULL, 'repo', 'directory', 10, 10, 1, 1);
      INSERT INTO entries VALUES ('/repo/.git', '/repo', '.git', 'directory', 1, 1, 1, 0);",
            )
            .unwrap();
        drop(database);
        assert_eq!(discover(&database_path).unwrap().count, 0);
    }
}
