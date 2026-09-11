//! Finding a line by typing what is on it.
//!
//! Command shift F in an editor is one question: which lines under this project
//! contain this text. The walk is the expensive half of answering it, and the
//! palette behind Command O has already walked the same tree, so this reuses
//! that file list instead of building a second one.
//!
//! No index of the contents is kept. An index would have to be invalidated by
//! the shell running beside it, which writes files constantly, and a stale hit
//! that opens at the wrong line is worse than a search that reads the files. A
//! project of a few thousand source files reads in well under the time it takes
//! to type the next character, which is the bar this has to clear.

use std::fs;

use serde::{Deserialize, Serialize};

/// One matching line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Hit {
    /// Absolute, because opening it is what happens next.
    pub path: String,
    /// What to show: the path with the project folder taken off the front.
    pub relative: String,
    /// One-based, which is what an editor and a person both count from.
    pub line: u32,
    /// The line itself, trimmed of leading blanks so a deeply indented match is
    /// still readable in a narrow pane.
    pub text: String,
    /// Where the match starts in `text`, in characters rather than bytes, so the
    /// shell can mark it without decoding UTF-8 again.
    pub column: usize,
    /// How many characters matched, for the same reason.
    pub length: usize,
}

/// Files larger than this are not searched. A source file is never this big, and
/// reading a checked-in archive costs the whole search.
const MAX_BYTES: u64 = 2 * 1024 * 1024;

/// How much of a file is inspected before deciding it is binary.
const SNIFF: usize = 1024;

/// Lines longer than this are matched but not carried whole. A minified bundle
/// is one line of a megabyte, and sending it would cost more than every real hit
/// together.
const MAX_LINE: usize = 400;

/// The lines under `files` that hold `query`, at most `limit` of them.
///
/// Stops as soon as the limit is reached rather than searching the rest: nobody
/// reads past a few hundred hits, and the files not yet opened are the saving.
pub fn search(root: &str, files: &[String], query: &str, limit: usize) -> Vec<Hit> {
    let query = query.trim();
    if query.is_empty() || limit == 0 {
        return Vec::new();
    }
    let needle = query.to_lowercase();
    let prefix = format!("{}/", root.trim_end_matches('/'));
    let mut hits = Vec::new();
    for path in files {
        if hits.len() >= limit {
            break;
        }
        let Some(text) = readable(path) else { continue };
        let relative = path.strip_prefix(&prefix).unwrap_or(path).to_string();
        for (index, line) in text.lines().enumerate() {
            if hits.len() >= limit {
                break;
            }
            let Some(column) = find_ignoring_case(line, &needle) else {
                continue;
            };
            hits.push(Hit {
                path: path.clone(),
                relative: relative.clone(),
                line: index as u32 + 1,
                text: shorten(line),
                column: column.saturating_sub(leading_blanks(line)),
                length: query.chars().count(),
            });
        }
    }
    hits
}

/// Where `needle` starts in `line`, counted in characters, ignoring case.
///
/// The haystack is lowercased per line rather than per file so a file whose
/// first line matches is not paid for in full.
fn find_ignoring_case(line: &str, needle: &str) -> Option<usize> {
    let lowered = line.to_lowercase();
    let byte = lowered.find(needle)?;
    // Lowercasing can change byte lengths, so the character offset is counted in
    // the lowered string and used against the original, where the character
    // count is the same even when the byte count is not.
    Some(lowered[..byte].chars().count())
}

fn leading_blanks(line: &str) -> usize {
    line.chars().take_while(|c| c.is_whitespace()).count()
}

fn shorten(line: &str) -> String {
    let trimmed = line.trim_start();
    if trimmed.chars().count() <= MAX_LINE {
        return trimmed.to_string();
    }
    trimmed.chars().take(MAX_LINE).collect()
}

/// The file's text, or nothing when it is too big or is not text at all.
fn readable(path: &str) -> Option<String> {
    let size = fs::metadata(path).ok()?.len();
    if size > MAX_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    // A NUL byte early on is what every grep uses to mean "binary", and it is
    // enough here: the alternative is decoding a megabyte to find out.
    if bytes.iter().take(SNIFF).any(|byte| *byte == 0) {
        return None;
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(directory: &std::path::Path, name: &str, body: &[u8]) -> String {
        let path = directory.join(name);
        fs::write(&path, body).unwrap();
        path.to_string_lossy().to_string()
    }

    fn scratch() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "akbun-terminal-grep-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
        ));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn finds_the_line_and_where_in_it_the_match_starts() {
        let directory = scratch();
        let root = directory.to_string_lossy().to_string();
        let file = write(&directory, "a.rs", b"let x = 1;\n    let TARGET = 2;\n");
        let hits = search(&root, &[file.clone()], "target", 10);
        assert_eq!(hits.len(), 1);
        let hit = &hits[0];
        assert_eq!(hit.line, 2);
        assert_eq!(hit.relative, "a.rs");
        // Indentation is taken off the text, so the column has to follow it.
        assert_eq!(hit.text, "let TARGET = 2;");
        assert_eq!(hit.column, 4);
        assert_eq!(hit.length, 6);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn stops_at_the_limit_and_skips_what_is_not_text() {
        let directory = scratch();
        let root = directory.to_string_lossy().to_string();
        let text = write(&directory, "a.txt", b"hit\nhit\nhit\n");
        let binary = write(&directory, "b.bin", b"hit\0hit\n");
        let hits = search(&root, &[text, binary], "hit", 2);
        assert_eq!(hits.len(), 2, "{hits:?}");
        assert!(hits.iter().all(|hit| hit.relative == "a.txt"), "{hits:?}");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_empty_query_is_not_every_line() {
        let directory = scratch();
        let root = directory.to_string_lossy().to_string();
        let file = write(&directory, "a.txt", b"anything\n");
        assert!(search(&root, &[file.clone()], "   ", 10).is_empty());
        assert!(search(&root, &[file], "a", 0).is_empty());
        fs::remove_dir_all(directory).unwrap();
    }
}
