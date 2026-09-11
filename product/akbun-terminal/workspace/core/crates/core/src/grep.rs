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
            let Some((start, end)) = find_ignoring_case(line, &needle) else {
                continue;
            };
            let blanks = leading_blanks(line);
            hits.push(Hit {
                path: path.clone(),
                relative: relative.clone(),
                line: index as u32 + 1,
                text: shorten(line),
                column: start.saturating_sub(blanks),
                // From the original line rather than from the query: a folded
                // match is not always as long as what was typed.
                length: end.saturating_sub(start),
            });
        }
    }
    hits
}

/// Where `needle` starts and ends in `line`, counted in the line's own
/// characters, ignoring case.
///
/// Lowercasing is done one character at a time, remembering which original
/// character each lowered character came from. Case folding is not
/// character-for-character — capital dotted I lowers to two characters — so an
/// offset counted in the lowered string points at the wrong place in the
/// original, and that offset is what the marking in the search pane uses.
///
/// The haystack is lowercased per line rather than per file so a file whose
/// first line matches is not paid for in full.
fn find_ignoring_case(line: &str, needle: &str) -> Option<(usize, usize)> {
    let mut lowered = String::with_capacity(line.len());
    let mut origin: Vec<usize> = Vec::new();
    let mut characters = 0;
    for (index, character) in line.chars().enumerate() {
        for folded in character.to_lowercase() {
            lowered.push(folded);
            origin.push(index);
        }
        characters = index + 1;
    }
    let byte = lowered.find(needle)?;
    let start = lowered[..byte].chars().count();
    let end = start + needle.chars().count();
    // Past the last lowered character means the match runs to the end of the
    // line, which is the one offset `origin` cannot name.
    let first = origin.get(start).copied()?;
    let last = origin.get(end).copied().unwrap_or(characters);
    Some((first, last))
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
    fn a_fold_that_changes_character_count_still_points_at_the_original() {
        // Capital dotted I lowers to two characters, so an offset counted in the
        // lowered line is one past where the match really starts.
        let directory = scratch();
        let root = directory.to_string_lossy().to_string();
        let file = write(&directory, "a.txt", "İİ needle".as_bytes());
        let hits = search(&root, &[file], "needle", 10);
        assert_eq!(hits.len(), 1, "{hits:?}");
        let hit = &hits[0];
        let characters: Vec<char> = hit.text.chars().collect();
        let matched: String = characters[hit.column..(hit.column + hit.length)].iter().collect();
        assert_eq!(matched, "needle", "{hit:?}");
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
