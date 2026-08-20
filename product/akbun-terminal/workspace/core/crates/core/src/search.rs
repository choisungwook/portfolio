//! Finding a file by typing part of its path.
//!
//! The palette behind Command O is two things: a list of every file under the
//! project, and a rule for which of them a few typed characters mean. Both are
//! here rather than in the shell, because the rule is the whole feature and a
//! rule nobody can test is a rule nobody can change.
//!
//! The list is walked once and kept, because a project is thousands of files and
//! walking it per keystroke is what makes a palette feel stuck. It is rebuilt
//! when it is older than a few seconds, which is the compromise a file that was
//! just created deserves without watching the whole tree.
//!
//! The scoring is a small dynamic program rather than a greedy scan. Greedy gets
//! `src/app.rs` wrong for the query `app`: it matches the a of `src` and then
//! cannot reach the rest, and a palette that misses the file whose name you just
//! typed is worse than no palette.

use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Match {
    /// Absolute, because opening it is what happens next.
    pub path: String,
    /// What to show: the path with the project folder taken off the front.
    pub relative: String,
    pub score: i32,
    /// Which characters of `relative` matched, so the shell can mark them.
    pub positions: Vec<usize>,
}

/// Directories nobody is looking for a file in. Dotfiles are not skipped as a
/// class: this browser exists partly to open .github and .claude.
const SKIPPED: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".build",
    "build",
    "dist",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".terraform",
    ".gradle",
    ".cache",
    "DerivedData",
];

/// Far more than anyone scrolls through, and low enough that a home directory
/// chosen as a project does not walk a disk.
const LIMIT: usize = 60_000;
const DEPTH: usize = 24;

/// The files under one root, and when they were counted.
pub struct Index {
    root: String,
    files: Vec<String>,
    built: Instant,
}

impl Index {
    pub fn build(root: &str) -> Self {
        let mut files = Vec::new();
        walk(Path::new(root), 0, &mut files);
        files.sort_by(|left, right| {
            left.len()
                .cmp(&right.len())
                .then_with(|| left.cmp(right))
        });
        Self {
            root: root.to_string(),
            files,
            built: Instant::now(),
        }
    }

    /// Whether this index still answers for `root`. Age is part of it: a file
    /// created by the shell in the middle of the window should turn up without
    /// anyone restarting the app.
    pub fn is_fresh_for(&self, root: &str, age: Duration) -> bool {
        self.root == root && self.built.elapsed() < age
    }

    pub fn len(&self) -> usize {
        self.files.len()
    }

    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// The best `limit` files for `query`, best first.
    ///
    /// An empty query is the list itself, shortest path first, which is what an
    /// palette that has only just opened should show rather than nothing.
    pub fn search(&self, query: &str, limit: usize) -> Vec<Match> {
        let prefix = format!("{}/", self.root.trim_end_matches('/'));
        let relative = |path: &String| path.strip_prefix(&prefix).unwrap_or(path).to_string();
        let query: String = query.chars().filter(|c| !c.is_whitespace()).collect();
        if query.is_empty() {
            return self
                .files
                .iter()
                .take(limit)
                .map(|path| Match {
                    path: path.clone(),
                    relative: relative(path),
                    score: 0,
                    positions: Vec::new(),
                })
                .collect();
        }

        let mut found: Vec<Match> = Vec::new();
        for path in &self.files {
            let text = relative(path);
            let Some((score, positions)) = score(&query, &text) else {
                continue;
            };
            found.push(Match {
                path: path.clone(),
                relative: text,
                score,
                positions,
            });
        }
        // Score first, then the shorter path: two files that match equally well
        // are ordered by which one has less around the match.
        found.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| left.relative.len().cmp(&right.relative.len()))
                .then_with(|| left.relative.cmp(&right.relative))
        });
        found.truncate(limit);
        found
    }
}

fn walk(directory: &Path, depth: usize, files: &mut Vec<String>) {
    if depth > DEPTH || files.len() >= LIMIT {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if files.len() >= LIMIT {
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // A symlink is never followed, which is the cheapest way to never walk
        // in a circle. The same rule the file browser uses.
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            if SKIPPED.contains(&name.as_str()) {
                continue;
            }
            walk(&entry.path(), depth + 1, files);
        } else if kind.is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }
}

const MATCH: i32 = 16;
const CONSECUTIVE: i32 = 12;
const BOUNDARY: i32 = 10;
const LAST_SEGMENT: i32 = 6;
const GAP: i32 = 1;
/// A run of skipped characters costs, but a file deep in a tree should not be
/// unreachable because of where it lives.
const GAP_FLOOR: i32 = -24;

/// How well `query` matches `candidate`, and where. `None` when the characters
/// are not in the candidate in that order at all.
///
/// Case is ignored, because nobody holds shift in a palette. An upper case
/// character in the candidate still counts as a word boundary, so `AD` finds
/// `AppDelegate.swift`.
pub fn score(query: &str, candidate: &str) -> Option<(i32, Vec<usize>)> {
    let needle: Vec<char> = query.chars().flat_map(|c| c.to_lowercase()).collect();
    let hay: Vec<char> = candidate.chars().collect();
    let lower: Vec<char> = hay
        .iter()
        .map(|c| c.to_lowercase().next().unwrap_or(*c))
        .collect();
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }

    // Cheap refusal first. The scoring below is only paid for by a candidate
    // that can actually match, which is a small fraction of a repository.
    let mut cursor = 0;
    for character in &needle {
        cursor = lower[cursor..].iter().position(|c| c == character)? + cursor + 1;
    }

    // Character indices throughout, never byte ones: a path with a non-ASCII
    // folder name in it would otherwise mark the wrong characters.
    let last_segment = hay.iter().rposition(|c| *c == '/').map(|index| index + 1).unwrap_or(0);
    let boundary = |index: usize| -> bool {
        if index == 0 {
            return true;
        }
        let previous = hay[index - 1];
        matches!(previous, '/' | '_' | '-' | '.' | ' ')
            || (hay[index].is_uppercase() && previous.is_lowercase())
    };

    // best[j] is the score of matching the query so far, ending on candidate
    // character j. `from` remembers which character before it was used, which
    // is what turns the answer back into a list of positions.
    let none = i32::MIN / 4;
    let mut best = vec![none; hay.len()];
    let mut from = vec![vec![usize::MAX; hay.len()]; needle.len()];
    for (row, character) in needle.iter().enumerate() {
        let mut next = vec![none; hay.len()];
        for index in 0..hay.len() {
            if lower[index] != *character {
                continue;
            }
            let mut here = MATCH;
            if boundary(index) {
                here += BOUNDARY;
            }
            if index >= last_segment {
                here += LAST_SEGMENT;
            }
            if row == 0 {
                // The first character pays for what it skipped past inside its
                // own segment, not for the whole path in front of it. Counting
                // the whole path would rank a file near the top of the tree
                // above the one whose name was actually typed.
                let segment = hay[..index].iter().rposition(|c| *c == '/').map(|at| at + 1).unwrap_or(0);
                next[index] = here + (-((index - segment) as i32) * GAP).max(GAP_FLOOR);
                continue;
            }
            let mut chosen = none;
            for previous in 0..index {
                if best[previous] == none {
                    continue;
                }
                let gap = (index - previous - 1) as i32;
                let mut total = best[previous] + here - (gap * GAP).min(-GAP_FLOOR);
                if gap == 0 {
                    total += CONSECUTIVE;
                }
                if total > chosen {
                    chosen = total;
                    from[row][index] = previous;
                }
            }
            next[index] = chosen;
        }
        best = next;
    }

    let end = (0..hay.len()).filter(|index| best[*index] != none).max_by_key(|index| best[*index])?;
    let mut positions = vec![0usize; needle.len()];
    let mut index = end;
    for row in (0..needle.len()).rev() {
        positions[row] = index;
        if row > 0 {
            index = from[row][index];
        }
    }
    // A short candidate is a better answer than a long one carrying the same
    // match, and this is the only part of the score that is about the file
    // rather than about where the characters landed.
    Some((best[end] - (hay.len() as i32) / 8, positions))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    fn temp_directory() -> std::path::PathBuf {
        let unique = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "akbun-terminal-search-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn best(query: &str, candidates: &[&str]) -> Vec<String> {
        let mut scored: Vec<(i32, &str)> = candidates
            .iter()
            .filter_map(|candidate| score(query, candidate).map(|(score, _)| (score, *candidate)))
            .collect();
        scored.sort_by(|left, right| right.0.cmp(&left.0));
        scored.into_iter().map(|(_, path)| path.to_string()).collect()
    }

    #[test]
    fn the_file_whose_name_was_typed_comes_first() {
        // The greedy version of this failed here: the a of src is matched first
        // and the rest of the query then has nowhere to go.
        let candidates = [
            "src/app.rs",
            "core/crates/core/src/protocol.rs",
            "Sources/akbun-terminal/AppDelegate.swift",
        ];
        assert_eq!(best("app", &candidates)[0], "src/app.rs");
        assert_eq!(best("appdel", &candidates)[0], "Sources/akbun-terminal/AppDelegate.swift");
    }

    #[test]
    fn characters_in_the_wrong_order_are_not_a_match() {
        assert!(score("psra", "src/app.rs").is_none());
        assert!(score("", "src/app.rs").is_none());
        assert!(score("longerthanthecandidate", "a.rs").is_none());
    }

    #[test]
    fn word_boundaries_beat_the_middle_of_a_word() {
        let candidates = ["Sources/akbun-terminal/AppDelegate.swift", "docs/happen/dellog.md"];
        assert_eq!(best("ad", &candidates)[0], "Sources/akbun-terminal/AppDelegate.swift");
    }

    #[test]
    fn a_path_fragment_matches_across_the_separator() {
        let (_, positions) = score("core/theme", "core/crates/core/src/theme.rs").unwrap();
        assert_eq!(positions.len(), "core/theme".len());
        // Every reported position is the character it says it is, which is what
        // the shell draws the marks from.
        let characters: String = "core/crates/core/src/theme.rs"
            .chars()
            .enumerate()
            .filter(|(index, _)| positions.contains(index))
            .map(|(_, character)| character)
            .collect();
        assert_eq!(characters.to_lowercase(), "core/theme");
    }

    #[test]
    fn walks_a_folder_and_skips_what_nobody_searches() {
        let directory = temp_directory();
        fs::create_dir_all(directory.join("src")).unwrap();
        fs::create_dir_all(directory.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(directory.join(".github/workflows")).unwrap();
        fs::write(directory.join("src/main.rs"), "").unwrap();
        fs::write(directory.join("node_modules/pkg/index.js"), "").unwrap();
        fs::write(directory.join(".github/workflows/ci.yml"), "").unwrap();

        let index = Index::build(directory.to_str().unwrap());
        let names: Vec<String> = index
            .search("", 10)
            .into_iter()
            .map(|m| m.relative)
            .collect();
        assert!(names.contains(&".github/workflows/ci.yml".to_string()), "{names:?}");
        assert!(names.contains(&"src/main.rs".to_string()), "{names:?}");
        assert!(!names.iter().any(|name| name.contains("node_modules")), "{names:?}");

        let found = index.search("mainrs", 10);
        assert_eq!(found[0].relative, "src/main.rs");
        assert!(found[0].path.starts_with(directory.to_str().unwrap()));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_empty_query_shows_shortest_paths_first() {
        let directory = temp_directory();
        fs::create_dir_all(directory.join("long/folder")).unwrap();
        fs::write(directory.join("z.txt"), "").unwrap();
        fs::write(directory.join("a.txt"), "").unwrap();
        fs::write(directory.join("long/folder/file.txt"), "").unwrap();

        let index = Index::build(directory.to_str().unwrap());
        let names: Vec<String> = index.search("", 10).into_iter().map(|m| m.relative).collect();
        assert_eq!(names, ["a.txt", "z.txt", "long/folder/file.txt"]);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_index_goes_stale_and_belongs_to_one_root() {
        let directory = temp_directory();
        let root = directory.to_str().unwrap();
        let index = Index::build(root);
        assert!(index.is_fresh_for(root, Duration::from_secs(5)));
        assert!(!index.is_fresh_for("/somewhere/else", Duration::from_secs(5)));
        assert!(!index.is_fresh_for(root, Duration::from_nanos(1)));
        fs::remove_dir_all(directory).unwrap();
    }
}
