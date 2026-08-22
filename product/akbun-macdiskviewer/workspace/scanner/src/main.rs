use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::env;
use std::fs::{self, Metadata};
use std::io::{self, BufRead, Write};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SCAN_CANCELLED: &str = "SCAN_CANCELLED";
const YIELD_EVERY: u64 = 200;
const THROTTLE_MS: u64 = 8;

const SCHEMA: &str = r#"
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = NORMAL;
CREATE TABLE entries (
  path TEXT PRIMARY KEY,
  parent_path TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  logical_bytes INTEGER NOT NULL,
  modified_ms INTEGER NOT NULL,
  descendants INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE issues (
  path TEXT NOT NULL,
  code TEXT NOT NULL
);
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX entries_parent ON entries(parent_path);
CREATE INDEX entries_size ON entries(size_bytes DESC);
CREATE INDEX entries_modified ON entries(modified_ms DESC);
"#;

#[derive(Default)]
struct Control {
    cancelled: AtomicBool,
    paused: AtomicBool,
}

#[derive(Clone, Copy, Debug, Default)]
struct Counters {
    entries: u64,
    files: u64,
    directories: u64,
    issues: u64,
    bytes: u64,
}

impl Counters {
    fn json(self, current_path: &Path) -> Value {
        json!({
          "entries": self.entries,
          "files": self.files,
          "directories": self.directories,
          "issues": self.issues,
          "bytes": self.bytes,
          "currentPath": current_path.to_string_lossy(),
        })
    }
}

#[derive(Default)]
struct Aggregate {
    size: u64,
    logical: u64,
    descendants: u64,
}

struct EntryRow<'a> {
    path: &'a str,
    parent_path: Option<&'a str>,
    name: &'a str,
    kind: &'a str,
    size: u64,
    logical: u64,
    modified: i64,
    descendants: u64,
}

struct Scanner<'a> {
    database: &'a Connection,
    control: Arc<Control>,
    counters: Counters,
    since_yield: u64,
    last_progress: Instant,
    root: PathBuf,
}

impl<'a> Scanner<'a> {
    fn new(database: &'a Connection, control: Arc<Control>, root: PathBuf) -> Self {
        Self {
            database,
            control,
            counters: Counters::default(),
            since_yield: 0,
            last_progress: Instant::now() - Duration::from_millis(250),
            root,
        }
    }

    fn checkpoint(&mut self, current_path: &Path) -> Result<()> {
        if self.control.cancelled.load(Ordering::Relaxed) {
            return Err(anyhow!(SCAN_CANCELLED));
        }
        while self.control.paused.load(Ordering::Relaxed) {
            if self.control.cancelled.load(Ordering::Relaxed) {
                return Err(anyhow!(SCAN_CANCELLED));
            }
            thread::sleep(Duration::from_millis(50));
        }
        self.since_yield += 1;
        if self.last_progress.elapsed() >= Duration::from_millis(250) {
            emit(json!({ "type": "progress", "progress": self.counters.json(current_path) }));
            self.last_progress = Instant::now();
        }
        if self.since_yield >= YIELD_EVERY {
            self.since_yield = 0;
            thread::sleep(Duration::from_millis(THROTTLE_MS));
        }
        Ok(())
    }

    fn visit(&mut self, entry_path: &Path, parent_path: Option<&Path>) -> Result<Aggregate> {
        self.checkpoint(entry_path)?;
        let metadata = match fs::symlink_metadata(entry_path) {
            Ok(metadata) => metadata,
            Err(error) => {
                self.record_issue(entry_path, &error);
                return Ok(Aggregate::default());
            }
        };
        let name = if entry_path == self.root {
            entry_path.file_name().map_or_else(
                || entry_path.to_string_lossy().into_owned(),
                |value| value.to_string_lossy().into_owned(),
            )
        } else {
            entry_path
                .file_name()
                .map_or_else(String::new, |value| value.to_string_lossy().into_owned())
        };
        let path_text = entry_path.to_string_lossy();
        let parent_text = parent_path.map(|value| value.to_string_lossy().into_owned());
        let logical = metadata.len();
        let modified = modified_ms(&metadata);

        if metadata.file_type().is_symlink() {
            self.insert_entry(EntryRow {
                path: &path_text,
                parent_path: parent_text.as_deref(),
                name: &name,
                kind: "link",
                size: 0,
                logical,
                modified,
                descendants: 0,
            })?;
            self.counters.entries += 1;
            return Ok(Aggregate {
                size: 0,
                logical,
                descendants: 0,
            });
        }
        if !metadata.is_dir() {
            let size = allocated_bytes(&metadata);
            self.insert_entry(EntryRow {
                path: &path_text,
                parent_path: parent_text.as_deref(),
                name: &name,
                kind: "file",
                size,
                logical,
                modified,
                descendants: 0,
            })?;
            self.counters.entries += 1;
            self.counters.files += 1;
            self.counters.bytes = self.counters.bytes.saturating_add(size);
            return Ok(Aggregate {
                size,
                logical,
                descendants: 0,
            });
        }

        let mut aggregate = Aggregate {
            size: allocated_bytes(&metadata),
            logical,
            descendants: 0,
        };
        match fs::read_dir(entry_path) {
            Ok(entries) => {
                for entry in entries {
                    let child_path = match entry {
                        Ok(child) => child.path(),
                        Err(error) => {
                            self.record_issue(entry_path, &error);
                            continue;
                        }
                    };
                    if should_skip_path(&child_path) {
                        continue;
                    }
                    let child = self.visit(&child_path, Some(entry_path))?;
                    aggregate.size = aggregate.size.saturating_add(child.size);
                    aggregate.logical = aggregate.logical.saturating_add(child.logical);
                    aggregate.descendants =
                        aggregate.descendants.saturating_add(child.descendants + 1);
                }
            }
            Err(error) => self.record_issue(entry_path, &error),
        }
        self.insert_entry(EntryRow {
            path: &path_text,
            parent_path: parent_text.as_deref(),
            name: &name,
            kind: "directory",
            size: aggregate.size,
            logical: aggregate.logical,
            modified,
            descendants: aggregate.descendants,
        })?;
        self.counters.entries += 1;
        self.counters.directories += 1;
        Ok(aggregate)
    }

    fn insert_entry(&mut self, entry: EntryRow<'_>) -> Result<()> {
        let mut statement = self.database.prepare_cached(
            "INSERT INTO entries
        (path, parent_path, name, kind, size_bytes, logical_bytes, modified_ms, descendants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )?;
        statement.execute(params![
            entry.path,
            entry.parent_path,
            entry.name,
            entry.kind,
            as_i64(entry.size),
            as_i64(entry.logical),
            entry.modified,
            as_i64(entry.descendants)
        ])?;
        Ok(())
    }

    fn record_issue(&mut self, path: &Path, error: &io::Error) {
        let code = error.raw_os_error().map_or_else(
            || format!("{:?}", error.kind()).to_uppercase(),
            |value| format!("OS_{value}"),
        );
        if let Ok(mut statement) = self
            .database
            .prepare_cached("INSERT INTO issues (path, code) VALUES (?, ?)")
        {
            let _ = statement.execute(params![path.to_string_lossy(), code]);
        }
        self.counters.issues += 1;
    }
}

fn scan_disk(root: &Path, database_path: &Path, control: Arc<Control>) -> Result<Counters> {
    let database = Connection::open(database_path)
        .with_context(|| format!("cannot open {}", database_path.display()))?;
    database.execute_batch(SCHEMA)?;
    database.execute_batch("BEGIN")?;
    let mut scanner = Scanner::new(&database, control, root.to_path_buf());
    let result = scanner.visit(root, None);
    if let Err(error) = result {
        let _ = database.execute_batch("ROLLBACK");
        return Err(error);
    }
    let completed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let hostname = env::var("HOSTNAME").unwrap_or_default();
    for (key, value) in [
        ("rootPath", root.to_string_lossy().into_owned()),
        ("completedAt", completed_at.to_string()),
        ("hostname", hostname),
        ("issues", scanner.counters.issues.to_string()),
    ] {
        database.execute(
            "INSERT INTO metadata (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
    }
    database.execute_batch("COMMIT")?;
    emit(json!({ "type": "progress", "progress": scanner.counters.json(root) }));
    Ok(scanner.counters)
}

fn listen_for_control(control: Arc<Control>) {
    thread::spawn(move || {
        for line in io::stdin().lock().lines().map_while(Result::ok) {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match message.get("type").and_then(Value::as_str) {
                Some("pause") => control.paused.store(true, Ordering::Relaxed),
                Some("resume") => control.paused.store(false, Ordering::Relaxed),
                Some("cancel") => {
                    control.cancelled.store(true, Ordering::Relaxed);
                    control.paused.store(false, Ordering::Relaxed);
                }
                _ => {}
            }
        }
    });
}

fn emit(message: Value) {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let _ = serde_json::to_writer(&mut output, &message);
    let _ = output.write_all(b"\n");
    let _ = output.flush();
}

fn allocated_bytes(metadata: &Metadata) -> u64 {
    metadata.blocks().saturating_mul(512)
}

fn modified_ms(metadata: &Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |value| {
            as_i64(value.as_millis().try_into().unwrap_or(u64::MAX))
        })
}

fn as_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn should_skip_path(path: &Path) -> bool {
    matches!(
        path.to_str(),
        Some(
            "/dev"
                | "/Network"
                | "/Volumes"
                | "/System/Volumes/Data"
                | "/System/Volumes/Preboot"
                | "/System/Volumes/Update"
                | "/System/Volumes/VM"
        )
    )
}

fn arguments() -> Result<(PathBuf, PathBuf)> {
    let mut root = None;
    let mut database = None;
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--root" => root = args.next().map(PathBuf::from),
            "--database" => database = args.next().map(PathBuf::from),
            _ => return Err(anyhow!("unknown argument: {argument}")),
        }
    }
    Ok((
        root.context("missing --root")?,
        database.context("missing --database")?,
    ))
}

fn main() {
    let result = (|| -> Result<()> {
        let (root, database) = arguments()?;
        let control = Arc::new(Control::default());
        listen_for_control(control.clone());
        match scan_disk(&root, &database, control) {
            Ok(counters) => emit(json!({
              "type": "complete",
              "result": counters.json(&root),
            })),
            Err(error) if error.to_string() == SCAN_CANCELLED => {
                emit(json!({ "type": "cancelled" }));
            }
            Err(error) => emit(json!({ "type": "error", "error": error.to_string() })),
        }
        Ok(())
    })();
    if let Err(error) = result {
        emit(json!({ "type": "error", "error": error.to_string() }));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::os::unix::fs::symlink;

    fn temp_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("akbun-macdiskviewer-{unique}"))
    }

    #[test]
    fn excludes_duplicate_and_external_macos_roots() {
        assert!(should_skip_path(Path::new("/Volumes")));
        assert!(should_skip_path(Path::new("/System/Volumes/Data")));
        assert!(!should_skip_path(Path::new("/Users")));
    }

    #[test]
    fn scans_files_directories_and_links() {
        let directory = temp_directory();
        let root = directory.join("root");
        let nested = root.join("nested");
        let database_path = directory.join("scan.sqlite");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("file.txt"), b"hello").unwrap();
        symlink(&nested, root.join("link")).unwrap();

        let counters = scan_disk(&root, &database_path, Arc::new(Control::default())).unwrap();
        assert_eq!(counters.entries, 4);
        assert_eq!(counters.files, 1);
        assert_eq!(counters.directories, 2);

        let database = Connection::open(&database_path).unwrap();
        let count: i64 = database
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 4);
        let kind: String = database
            .query_row(
                "SELECT kind FROM entries WHERE path = ?",
                [root.join("link").to_string_lossy().into_owned()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kind, "link");
        let file_path = nested.join("file.txt").to_string_lossy().into_owned();
        let nested_path = nested.to_string_lossy().into_owned();
        let root_path = root.to_string_lossy().into_owned();
        let file_size: i64 = database
            .query_row(
                "SELECT size_bytes FROM entries WHERE path = ?",
                [&file_path],
                |row| row.get(0),
            )
            .unwrap();
        let (nested_size, nested_descendants): (i64, i64) = database
            .query_row(
                "SELECT size_bytes, descendants FROM entries WHERE path = ?",
                [&nested_path],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let (root_size, root_descendants): (i64, i64) = database
            .query_row(
                "SELECT size_bytes, descendants FROM entries WHERE path = ?",
                [&root_path],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(file_size > 0);
        assert!(nested_size >= file_size);
        assert!(root_size >= nested_size);
        assert_eq!(nested_descendants, 1);
        assert_eq!(root_descendants, 3);
        let metadata_root: String = database
            .query_row(
                "SELECT value FROM metadata WHERE key = 'rootPath'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let metadata_issues: String = database
            .query_row(
                "SELECT value FROM metadata WHERE key = 'issues'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(metadata_root, root_path);
        assert_eq!(metadata_issues, "0");
        drop(database);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancellation_rolls_back_partial_entries() {
        let directory = temp_directory();
        let root = directory.join("root");
        let database_path = directory.join("scan.sqlite");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file.txt"), b"hello").unwrap();
        let control = Arc::new(Control::default());
        control.cancelled.store(true, Ordering::Relaxed);

        let error = scan_disk(&root, &database_path, control).unwrap_err();
        assert_eq!(error.to_string(), SCAN_CANCELLED);

        let database = Connection::open(&database_path).unwrap();
        let entries: i64 = database
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
            .unwrap();
        let metadata: i64 = database
            .query_row("SELECT COUNT(*) FROM metadata", [], |row| row.get(0))
            .unwrap();
        assert_eq!(entries, 0);
        assert_eq!(metadata, 0);
        drop(database);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancel_releases_a_paused_scan() {
        let database = Connection::open_in_memory().unwrap();
        let control = Arc::new(Control::default());
        control.paused.store(true, Ordering::Relaxed);
        let cancel = control.clone();
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(20));
            cancel.cancelled.store(true, Ordering::Relaxed);
        });
        let mut scanner = Scanner::new(&database, control, PathBuf::from("/"));
        let error = scanner.checkpoint(Path::new("/")).unwrap_err();
        assert_eq!(error.to_string(), SCAN_CANCELLED);
        handle.join().unwrap();
    }
}
