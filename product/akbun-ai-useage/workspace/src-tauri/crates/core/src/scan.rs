//! Walks log directories and parses each file once per change. Claude Code and
//! Codex logs grow to hundreds of MB, so a refresh every few minutes must not
//! reread files whose mtime and size are unchanged.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub struct FileInfo {
    pub path: PathBuf,
    pub mtime_ms: i64,
    pub size: u64,
}

pub fn list_files(dir: &Path, extension: &str, since_ms: i64, out: &mut Vec<FileInfo>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            list_files(&path, extension, since_ms, out);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some(extension) {
            continue;
        }
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if mtime_ms >= since_ms {
            out.push(FileInfo {
                path,
                mtime_ms,
                size: meta.len(),
            });
        }
    }
}

struct Entry<T> {
    mtime_ms: i64,
    size: u64,
    value: T,
}

pub struct ParseCache<T> {
    entries: HashMap<PathBuf, Entry<T>>,
}

impl<T: Clone> Default for ParseCache<T> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }
}

impl<T: Clone> ParseCache<T> {
    /// Returns parse(text) per file, reusing unchanged results. Files that fell
    /// out of the window are dropped from the cache.
    pub fn parse_all(&mut self, files: &[FileInfo], parse: impl Fn(&str) -> T) -> Vec<T> {
        let mut seen = HashSet::new();
        let mut results = Vec::with_capacity(files.len());
        for file in files {
            seen.insert(file.path.clone());
            if let Some(entry) = self.entries.get(&file.path) {
                if entry.mtime_ms == file.mtime_ms && entry.size == file.size {
                    results.push(entry.value.clone());
                    continue;
                }
            }
            let text = fs::read_to_string(&file.path).unwrap_or_default();
            let value = parse(&text);
            results.push(value.clone());
            self.entries.insert(
                file.path.clone(),
                Entry {
                    mtime_ms: file.mtime_ms,
                    size: file.size,
                    value,
                },
            );
        }
        self.entries.retain(|path, _| seen.contains(path));
        results
    }
}

pub fn json_lines(text: &str) -> impl Iterator<Item = serde_json::Value> + '_ {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
}

pub fn parse_time(value: &serde_json::Value) -> Option<i64> {
    let text = value.as_str()?;
    chrono::DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|t| t.timestamp_millis())
}
