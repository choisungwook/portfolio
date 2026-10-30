//! The catalog: which files were imported, their tags, rating and edit.
//!
//! Photos are referenced where they are, never copied, so a library on an
//! external drive costs the internal disk only this file and the thumbnails.
//! ponytail: one JSON file rewritten on every change; move to SQLite if a
//! catalog grows past tens of thousands of photos and saves feel slow.

use crate::decode;
use crate::edit::Edit;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Photo {
    pub id: u64,
    pub path: PathBuf,
    pub added: u64,
    #[serde(default)]
    pub rating: u8,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub edit: Edit,
}

impl Photo {
    pub fn folder(&self) -> PathBuf {
        self.path.parent().map(Path::to_path_buf).unwrap_or_default()
    }

    pub fn name(&self) -> String {
        self.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Catalog {
    /// Bumped on every write, so a reader can tell the file changed.
    pub revision: u64,
    pub next_id: u64,
    pub photos: Vec<Photo>,
}

#[derive(Debug, Default, Serialize)]
pub struct ImportReport {
    pub added: Vec<u64>,
    /// Already in the catalog.
    pub existing: usize,
    /// Not a photo, or not readable.
    pub skipped: usize,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Filter {
    pub folder: Option<PathBuf>,
    pub tag: Option<String>,
    pub search: Option<String>,
    pub min_rating: u8,
}

/// Trim, collapse inner spaces, cap the length. Empty means no tag.
pub fn normalize_tag(tag: &str) -> Option<String> {
    let t: String = tag.split_whitespace().collect::<Vec<_>>().join(" ");
    let t: String = t.chars().take(64).collect();
    (!t.is_empty()).then_some(t)
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with('.'))
}

/// Every supported photo under `path`, a file or a folder searched recursively.
/// Symbolic links to folders are not followed, so a loop cannot hang import.
fn collect(path: &Path, out: &mut Vec<PathBuf>, skipped: &mut usize) {
    let Ok(meta) = fs::symlink_metadata(path) else {
        *skipped += 1;
        return;
    };
    if meta.is_dir() {
        let Ok(entries) = fs::read_dir(path) else {
            *skipped += 1;
            return;
        };
        let mut children: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        children.sort();
        for child in children.iter().filter(|c| !is_hidden(c)) {
            collect(child, out, skipped);
        }
    } else if decode::is_supported(path) && fs::metadata(path).is_ok_and(|m| m.is_file()) {
        out.push(path.to_path_buf());
    } else {
        *skipped += 1;
    }
}

impl Catalog {
    pub fn get(&self, id: u64) -> crate::Result<&Photo> {
        self.photos.iter().find(|p| p.id == id).ok_or_else(|| format!("no photo with id {id}"))
    }

    fn get_mut(&mut self, id: u64) -> crate::Result<&mut Photo> {
        self.photos.iter_mut().find(|p| p.id == id).ok_or_else(|| format!("no photo with id {id}"))
    }

    pub fn import(&mut self, paths: &[PathBuf]) -> ImportReport {
        let mut report = ImportReport::default();
        let mut found = Vec::new();
        for path in paths {
            collect(path, &mut found, &mut report.skipped);
        }
        let mut known: BTreeSet<PathBuf> = self.photos.iter().map(|p| p.path.clone()).collect();
        let added = now();
        for path in found {
            let path = fs::canonicalize(&path).unwrap_or(path);
            if !known.insert(path.clone()) {
                report.existing += 1;
                continue;
            }
            self.next_id += 1;
            report.added.push(self.next_id);
            self.photos.push(Photo {
                id: self.next_id,
                path,
                added,
                rating: 0,
                tags: Vec::new(),
                edit: Edit::default(),
            });
        }
        report
    }

    pub fn remove(&mut self, ids: &[u64]) -> usize {
        let before = self.photos.len();
        self.photos.retain(|p| !ids.contains(&p.id));
        before - self.photos.len()
    }

    pub fn tag(&mut self, ids: &[u64], add: &[String], remove: &[String]) -> crate::Result<()> {
        let add: Vec<String> = add.iter().filter_map(|t| normalize_tag(t)).collect();
        let remove: Vec<String> = remove.iter().filter_map(|t| normalize_tag(t)).collect();
        for &id in ids {
            let photo = self.get_mut(id)?;
            let mut tags: BTreeSet<String> = photo.tags.drain(..).collect();
            tags.extend(add.iter().cloned());
            tags.retain(|t| !remove.contains(t));
            photo.tags = tags.into_iter().collect();
        }
        Ok(())
    }

    /// Rename a tag on every photo that has it.
    pub fn rename_tag(&mut self, from: &str, to: &str) -> crate::Result<usize> {
        let (from, to) = match (normalize_tag(from), normalize_tag(to)) {
            (Some(f), Some(t)) => (f, t),
            _ => return Err("tag names cannot be empty".into()),
        };
        let ids: Vec<u64> = self.photos.iter().filter(|p| p.tags.contains(&from)).map(|p| p.id).collect();
        self.tag(&ids, &[to], &[from])?;
        Ok(ids.len())
    }

    pub fn rate(&mut self, ids: &[u64], rating: u8) -> crate::Result<()> {
        if rating > 5 {
            return Err("rating is 0 to 5".into());
        }
        for &id in ids {
            self.get_mut(id)?.rating = rating;
        }
        Ok(())
    }

    pub fn set_edit(&mut self, id: u64, edit: &Edit) -> crate::Result<Edit> {
        let edit = edit.sanitized();
        self.get_mut(id)?.edit = edit.clone();
        Ok(edit)
    }

    /// Point every photo under `from` at the same place under `to`, for a drive
    /// that now mounts under another name or a folder that was moved.
    pub fn relink(&mut self, from: &Path, to: &Path) -> usize {
        let mut count = 0;
        for photo in &mut self.photos {
            if let Ok(rest) = photo.path.strip_prefix(from) {
                photo.path = to.join(rest);
                count += 1;
            }
        }
        count
    }

    pub fn list(&self, filter: &Filter) -> Vec<&Photo> {
        let search = filter.search.as_deref().map(str::to_lowercase).filter(|s| !s.is_empty());
        self.photos
            .iter()
            .filter(|p| filter.folder.as_ref().is_none_or(|f| p.path.starts_with(f)))
            .filter(|p| filter.tag.as_ref().is_none_or(|t| p.tags.contains(t)))
            .filter(|p| p.rating >= filter.min_rating)
            .filter(|p| {
                search.as_ref().is_none_or(|s| {
                    p.name().to_lowercase().contains(s) || p.tags.iter().any(|t| t.to_lowercase().contains(s))
                })
            })
            .collect()
    }

    pub fn tags(&self) -> BTreeMap<String, usize> {
        let mut out = BTreeMap::new();
        for tag in self.photos.iter().flat_map(|p| &p.tags) {
            *out.entry(tag.clone()).or_insert(0) += 1;
        }
        out
    }

    pub fn folders(&self) -> BTreeMap<PathBuf, usize> {
        let mut out = BTreeMap::new();
        for photo in &self.photos {
            *out.entry(photo.folder()).or_insert(0) += 1;
        }
        out
    }
}

/// The catalog file plus the lock that serializes writers across processes.
pub struct Store {
    path: PathBuf,
}

/// `MAKEPHOTO_CATALOG`, or the app's data folder. The app and the CLI both
/// call this, so they cannot disagree about where the catalog lives.
pub fn default_path() -> PathBuf {
    if let Some(path) = std::env::var_os("MAKEPHOTO_CATALOG") {
        return PathBuf::from(path);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    home.join("Library/Application Support/io.akbun.makephoto/catalog.json")
}

impl Store {
    pub fn new(path: impl Into<PathBuf>) -> Store {
        Store { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The current catalog. A missing file is an empty catalog. Writers replace
    /// the file by rename, so a reader never sees half of one.
    pub fn read(&self) -> crate::Result<Catalog> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("catalog {} is damaged: {e}", self.path.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Catalog::default()),
            Err(e) => Err(format!("cannot read {}: {e}", self.path.display())),
        }
    }

    /// Lock, read, change, write. On error nothing is written.
    pub fn update<T>(&self, change: impl FnOnce(&mut Catalog) -> crate::Result<T>) -> crate::Result<(Catalog, T)> {
        let dir = self.path.parent().ok_or("catalog path has no folder")?;
        fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        let lock = File::create(self.path.with_extension("lock")).map_err(|e| e.to_string())?;
        lock.lock().map_err(|e| format!("cannot lock the catalog: {e}"))?;

        let mut catalog = self.read()?;
        let value = change(&mut catalog)?;
        catalog.revision += 1;

        let tmp = self.path.with_extension(format!("tmp-{}", std::process::id()));
        let bytes = serde_json::to_vec_pretty(&catalog).map_err(|e| e.to_string())?;
        let write = || -> std::io::Result<()> {
            let mut file = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            fs::rename(&tmp, &self.path)
        };
        write().map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("cannot save the catalog: {e}")
        })?;
        Ok((catalog, value))
        // The lock is released when `lock` drops.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn photo_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let img = image::RgbImage::new(4, 4);
        img.save(dir.path().join("a.jpg")).unwrap();
        fs::create_dir(dir.path().join("trip")).unwrap();
        img.save(dir.path().join("trip/b.png")).unwrap();
        fs::write(dir.path().join("trip/notes.txt"), "x").unwrap();
        img.save(dir.path().join(".hidden.jpg")).unwrap();
        dir
    }

    #[test]
    fn import_walks_folders_and_skips_duplicates() {
        let dir = photo_dir();
        let mut c = Catalog::default();
        let r = c.import(&[dir.path().to_path_buf()]);
        assert_eq!(r.added.len(), 2);
        assert_eq!(r.skipped, 1);
        let again = c.import(&[dir.path().join("a.jpg")]);
        assert_eq!((again.added.len(), again.existing), (0, 1));
        assert_eq!(c.folders().len(), 2);
    }

    #[test]
    fn tags_are_normalized_and_filterable() {
        let dir = photo_dir();
        let mut c = Catalog::default();
        let ids = c.import(&[dir.path().to_path_buf()]).added;
        c.tag(&ids, &["  summer   trip ".into(), "".into()], &[]).unwrap();
        c.tag(&ids[..1], &[], &["summer trip".into()]).unwrap();
        assert_eq!(c.tags().get("summer trip"), Some(&1));
        let filter = Filter { tag: Some("summer trip".into()), ..Filter::default() };
        assert_eq!(c.list(&filter).len(), 1);
        assert_eq!(c.rename_tag("summer trip", "beach").unwrap(), 1);
        assert_eq!(c.tags().keys().collect::<Vec<_>>(), vec!["beach"]);
    }

    #[test]
    fn relink_moves_a_prefix() {
        let mut c = Catalog::default();
        c.photos.push(Photo {
            id: 1,
            path: "/Volumes/Old/pics/a.jpg".into(),
            added: 0,
            rating: 0,
            tags: vec![],
            edit: Edit::default(),
        });
        assert_eq!(c.relink(Path::new("/Volumes/Old"), Path::new("/Volumes/New")), 1);
        assert_eq!(c.photos[0].path, PathBuf::from("/Volumes/New/pics/a.jpg"));
    }

    #[test]
    fn store_bumps_revision_and_keeps_old_file_on_error() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("sub/catalog.json"));
        let (c, _) = store.update(|c| Ok(c.next_id = 5)).unwrap();
        assert_eq!((c.revision, c.next_id), (1, 5));
        assert!(store.update(|_| Err::<(), _>("no".into())).is_err());
        assert_eq!(store.read().unwrap().revision, 1);
    }

    #[test]
    fn concurrent_writers_do_not_lose_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("catalog.json");
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    for _ in 0..10 {
                        Store::new(&path).update(|c| Ok(c.next_id += 1)).unwrap();
                    }
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        assert_eq!(Store::new(&path).read().unwrap().next_id, 80);
    }
}
