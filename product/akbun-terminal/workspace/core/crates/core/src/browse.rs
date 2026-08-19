//! Reading one directory level at a time.
//!
//! The whole tree is never walked. A folder with a dependency directory in it
//! has more entries than anyone scrolls through, and reading it all to draw the
//! first row is what makes a file browser feel stuck.
//!
//! Two rules live here rather than in the shell, so the same folder does not
//! look different depending on what draws it: dotfiles are hidden, and a symlink
//! is a leaf even when it points at a directory. Not following links is the
//! cheapest way to never walk into a cycle.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// Directories first, then names compared without case. Case sensitive order
/// puts `README` above `src` and `apps` below it, which reads as random.
pub fn read_directory(path: &str) -> Result<Vec<Entry>, String> {
    let path = Path::new(path);
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|error| format!("{}: {error}", path.display()))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_directory = match entry.file_type() {
            // A symlink reports its own type here, never the target's, which is
            // exactly the leaf behaviour wanted.
            Ok(kind) => kind.is_dir(),
            Err(_) => continue,
        };
        entries.push(Entry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_directory,
        });
    }
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("{path}: {error}"))
}

pub fn write_file(path: &str, text: &str) -> Result<(), String> {
    fs::write(path, text).map_err(|error| format!("{path}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// A counter rather than a clock: these tests run on threads of one process,
    /// and two of them reading the same nanosecond share a directory.
    static NEXT: AtomicU32 = AtomicU32::new(0);

    fn temp_directory() -> std::path::PathBuf {
        let unique = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "akbun-terminal-browse-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn hides_dotfiles_and_puts_directories_first() {
        let directory = temp_directory();
        fs::write(directory.join("README.md"), "hi").unwrap();
        fs::write(directory.join(".hidden"), "no").unwrap();
        fs::create_dir(directory.join("src")).unwrap();
        fs::create_dir(directory.join("Apps")).unwrap();

        let entries = read_directory(directory.to_str().unwrap()).unwrap();
        let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["Apps", "src", "README.md"]);
        assert!(entries[0].is_directory);
        assert!(!entries[2].is_directory);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_link_to_a_directory_is_a_leaf() {
        // Following it is how a browser walks in a circle, so it must not be
        // reported as something that can be expanded.
        let directory = temp_directory();
        fs::create_dir(directory.join("real")).unwrap();
        std::os::unix::fs::symlink(&directory, directory.join("loop")).unwrap();

        let entries = read_directory(directory.to_str().unwrap()).unwrap();
        let link = entries.iter().find(|entry| entry.name == "loop").unwrap();
        assert!(!link.is_directory);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_the_path_that_failed() {
        let error = read_directory("/definitely/not/here").unwrap_err();
        assert!(error.contains("/definitely/not/here"), "{error}");
    }
}
