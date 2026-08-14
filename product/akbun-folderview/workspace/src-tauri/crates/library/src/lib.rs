// The library model: what an entry is, how a folder is scanned, and how a
// rescan keeps the meaning the user attached to a file.
//
// Search, the folder tree and the tag counts are deliberately NOT here. They
// run in the page over its own copy of the entries, because asking the backend
// on every keystroke would be the slow way to do the same thing. See
// src/library.js and adr/2026-08-library-is-what-you-add.md.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub const LIBRARY_SCHEMA_VERSION: u32 = 2;

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic", "tif", "tiff",
];
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv", "mpg", "mpeg",
];

/// One photo or video. The field names are what the page reads, so renaming
/// one here breaks the renderer silently; serde keeps them in camelCase to
/// match the JavaScript side.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub dir: String,
    /// "photo" or "video". Never None: a file that is neither is not indexed.
    pub kind: String,
    pub size: u64,
    /// Milliseconds since the epoch, so the page can hand it to Date directly.
    pub mtime: u64,
    pub rating: u8,
    pub favorite: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Root {
    pub path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Library {
    pub roots: Vec<Root>,
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceLocation {
    pub id: String,
    pub mount_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLibrary {
    pub mount_path: String,
    pub roots: Vec<Root>,
    pub entries: Vec<Entry>,
}

impl DeviceLibrary {
    pub fn rebase(&mut self, mount_path: &str) {
        if self.mount_path == mount_path {
            return;
        }
        for root in &mut self.roots {
            root.path = rebase_path(&root.path, &self.mount_path, mount_path);
        }
        for entry in &mut self.entries {
            entry.path = rebase_path(&entry.path, &self.mount_path, mount_path);
            entry.dir = parent_path(&entry.path);
        }
        self.mount_path = mount_path.to_string();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredLibrary {
    pub schema_version: u32,
    pub devices: BTreeMap<String, DeviceLibrary>,
    #[serde(default, skip_serializing_if = "Library::is_empty")]
    pub legacy: Library,
}

impl Default for StoredLibrary {
    fn default() -> Self {
        Self {
            schema_version: LIBRARY_SCHEMA_VERSION,
            devices: BTreeMap::new(),
            legacy: Library::default(),
        }
    }
}

impl Library {
    pub fn is_empty(&self) -> bool {
        self.roots.is_empty() && self.entries.is_empty()
    }
}

impl StoredLibrary {
    pub fn device_mut(&mut self, location: &DeviceLocation) -> &mut DeviceLibrary {
        let device = self
            .devices
            .entry(location.id.clone())
            .or_insert_with(|| DeviceLibrary {
                mount_path: location.mount_path.clone(),
                ..DeviceLibrary::default()
            });
        device.rebase(&location.mount_path);
        device
    }

    pub fn migrate_legacy<Locate, Matches>(
        &mut self,
        locate: Locate,
        matches_entry: Matches,
    ) -> bool
    where
        Locate: Fn(&str) -> Option<DeviceLocation>,
        Matches: Fn(&Entry) -> bool,
    {
        if self.legacy.is_empty() {
            return false;
        }

        let mut changed = false;
        let mut remaining_entries = std::mem::take(&mut self.legacy.entries);
        let mut remaining_roots = Vec::new();

        for root in std::mem::take(&mut self.legacy.roots) {
            let (under_root, outside_root): (Vec<_>, Vec<_>) = remaining_entries
                .into_iter()
                .partition(|entry| is_under(&entry.path, &root.path));
            remaining_entries = outside_root;

            let location = locate(&root.path);
            let same_device = under_root.is_empty() || under_root.iter().any(&matches_entry);
            if let Some(location) = location.filter(|_| same_device) {
                let device = self.device_mut(&location);
                push_root(device, root);
                merge_entries(device, under_root);
                changed = true;
            } else {
                remaining_roots.push(root);
                remaining_entries.extend(under_root);
            }
        }

        let mut unresolved = Vec::new();
        for entry in remaining_entries {
            if matches_entry(&entry) {
                if let Some(location) = locate(&entry.path) {
                    merge_entries(self.device_mut(&location), vec![entry]);
                    changed = true;
                    continue;
                }
            }
            unresolved.push(entry);
        }

        self.legacy.roots = remaining_roots;
        self.legacy.entries = unresolved;
        changed
    }
}

fn push_root(device: &mut DeviceLibrary, root: Root) {
    if !device.roots.iter().any(|known| known.path == root.path) {
        device.roots.push(root);
    }
}

fn merge_entries(device: &mut DeviceLibrary, entries: Vec<Entry>) {
    let known: std::collections::HashSet<String> = device
        .entries
        .iter()
        .map(|entry| entry.path.clone())
        .collect();
    device
        .entries
        .extend(entries.into_iter().filter(|entry| !known.contains(&entry.path)));
}

fn rebase_path(path: &str, old_mount: &str, new_mount: &str) -> String {
    let Some(relative) = path.strip_prefix(old_mount) else {
        return path.to_string();
    };
    let relative = relative.trim_start_matches(['/', '\\']);
    if new_mount.ends_with(['/', '\\']) {
        format!("{new_mount}{relative}")
    } else {
        let separator = if new_mount.contains('\\') { '\\' } else { '/' };
        format!("{new_mount}{separator}{relative}")
    }
}

fn parent_path(path: &str) -> String {
    path.rfind(['/', '\\'])
        .map(|index| path[..index].to_string())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// "system" follows the operating system.
    pub theme: String,
    /// The system file browser opens on double click, so that is the default
    /// here too. Single click is offered because this window is a viewer.
    pub open_on_single_click: bool,
    pub card_size: u32,
    /// "grid" is thumbnail cards, "list" is detail rows like the file explorer.
    pub view: String,
    /// A video poster frame costs a read of the video file itself, so it can
    /// be turned off for a slow disk.
    pub show_video_thumbs: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            open_on_single_click: false,
            card_size: 180,
            view: "grid".to_string(),
            show_video_thumbs: true,
        }
    }
}

/// Photo, video, or None for anything else. Extension only: reading headers for
/// a few thousand files would make adding a folder slow for no visible gain.
pub fn file_kind(name: &str) -> Option<&'static str> {
    let extension = Path::new(name)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        Some("photo")
    } else if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
        Some("video")
    } else {
        None
    }
}

/// Build an entry from a path on disk. Returns None for a file that is neither
/// a photo nor a video, which is how the scan filters.
pub fn make_entry(path: &Path) -> Option<Entry> {
    let name = path.file_name()?.to_str()?.to_string();
    let kind = file_kind(&name)?;
    let metadata = std::fs::metadata(path).ok()?;
    let mtime = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64)
        .unwrap_or(0);

    Some(Entry {
        path: path.to_string_lossy().to_string(),
        name,
        dir: path
            .parent()
            .map(|parent| parent.to_string_lossy().to_string())
            .unwrap_or_default(),
        kind: kind.to_string(),
        size: metadata.len(),
        mtime,
        rating: 0,
        favorite: false,
        tags: Vec::new(),
    })
}

/// Walk one added folder and keep the photos and videos. Unreadable folders are
/// skipped rather than failing the whole scan, which matters because a picture
/// folder often contains something the user cannot read.
pub fn scan_folder(root: &Path) -> Vec<Entry> {
    walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|item| item.file_type().is_file())
        .filter_map(|item| make_entry(item.path()))
        .collect()
}

/// Keep the tags, rating and favorite the user set. A scan sees files, not the
/// meaning attached to them, so it must not overwrite that.
pub fn merge_scan(existing: &[Entry], scanned: Vec<Entry>) -> Vec<Entry> {
    let by_path: std::collections::HashMap<&str, &Entry> = existing
        .iter()
        .map(|entry| (entry.path.as_str(), entry))
        .collect();

    scanned
        .into_iter()
        .map(|mut entry| {
            if let Some(old) = by_path.get(entry.path.as_str()) {
                entry.rating = old.rating;
                entry.favorite = old.favorite;
                entry.tags = old.tags.clone();
            }
            entry
        })
        .collect()
}

/// True when the path sits inside the root, rather than merely starting with
/// the same characters. Without the separator check, "C:\photos-backup" would
/// count as being under "C:\photos".
pub fn is_under(path: &str, root: &str) -> bool {
    path.strip_prefix(root)
        .is_some_and(|rest| rest.starts_with(['/', '\\']))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, rating: u8, tags: &[&str]) -> Entry {
        Entry {
            path: path.to_string(),
            name: path.rsplit(['/', '\\']).next().unwrap().to_string(),
            dir: String::new(),
            kind: "photo".to_string(),
            size: 1,
            mtime: 1,
            rating,
            favorite: rating > 3,
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
        }
    }

    #[test]
    fn file_kind_knows_photos_from_videos() {
        assert_eq!(file_kind("a.JPG"), Some("photo"));
        assert_eq!(file_kind("a.mp4"), Some("video"));
        assert_eq!(file_kind("a.txt"), None);
        assert_eq!(file_kind("README"), None);
    }

    #[test]
    fn a_rescan_keeps_the_tags_and_rating_the_user_set() {
        let existing = vec![entry("C:\\photos\\a.jpg", 5, &["beach"])];
        let scanned = vec![entry("C:\\photos\\a.jpg", 0, &[]), entry("C:\\photos\\b.jpg", 0, &[])];

        let merged = merge_scan(&existing, scanned);

        assert_eq!(merged[0].rating, 5);
        assert_eq!(merged[0].tags, vec!["beach".to_string()]);
        assert!(merged[0].favorite);
        assert_eq!(merged[1].rating, 0, "a file the user never touched stays clean");
    }

    #[test]
    fn a_sibling_folder_with_a_shared_prefix_is_not_under_the_root() {
        assert!(is_under("C:\\photos\\a.jpg", "C:\\photos"));
        assert!(is_under("/photos/a.jpg", "/photos"));
        assert!(!is_under("C:\\photos-backup\\a.jpg", "C:\\photos"));
        assert!(!is_under("C:\\photos", "C:\\photos"));
    }

    #[test]
    fn settings_fall_back_per_field_when_the_file_is_partial() {
        // A hand-edited or older file must still load. serde(default) fills the
        // fields that are missing rather than failing the whole parse.
        let parsed: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(parsed.theme, "dark");
        assert_eq!(parsed.card_size, 180);
        assert!(!parsed.open_on_single_click);
        assert_eq!(parsed.view, "grid");
        assert!(parsed.show_video_thumbs);
    }

    #[test]
    fn legacy_data_is_grouped_by_device_id_without_losing_metadata() {
        let mut stored = StoredLibrary {
            legacy: Library {
                roots: vec![Root {
                    path: "E:\\photos".to_string(),
                }],
                entries: vec![entry("E:\\photos\\a.jpg", 5, &["family"])],
            },
            ..StoredLibrary::default()
        };

        let changed = stored.migrate_legacy(
            |_| {
                Some(DeviceLocation {
                    id: "volume-a".to_string(),
                    mount_path: "E:\\".to_string(),
                })
            },
            |_| true,
        );

        assert!(changed);
        assert!(stored.legacy.is_empty());
        let device = &stored.devices["volume-a"];
        assert_eq!(device.roots[0].path, "E:\\photos");
        assert_eq!(device.entries[0].rating, 5);
        assert_eq!(device.entries[0].tags, ["family"]);
    }

    #[test]
    fn disconnected_legacy_data_stays_pending_for_a_later_start() {
        let original = entry("E:\\photos\\a.jpg", 4, &["keep"]);
        let mut stored = StoredLibrary {
            legacy: Library {
                roots: vec![Root {
                    path: "E:\\photos".to_string(),
                }],
                entries: vec![original.clone()],
            },
            ..StoredLibrary::default()
        };

        assert!(!stored.migrate_legacy(|_| None, |_| false));
        assert_eq!(stored.legacy.roots.len(), 1);
        assert_eq!(stored.legacy.entries[0].tags, original.tags);
        assert!(stored.devices.is_empty());
    }

    #[test]
    fn a_device_keeps_its_library_when_its_mount_path_changes() {
        let mut stored = StoredLibrary::default();
        let first = DeviceLocation {
            id: "volume-a".to_string(),
            mount_path: "E:\\".to_string(),
        };
        let device = stored.device_mut(&first);
        device.roots.push(Root {
            path: "E:\\photos".to_string(),
        });
        device.entries.push(entry("E:\\photos\\a.jpg", 5, &[]));

        let second = DeviceLocation {
            id: "volume-a".to_string(),
            mount_path: "F:\\".to_string(),
        };
        let rebased = stored.device_mut(&second);

        assert_eq!(rebased.roots[0].path, "F:\\photos");
        assert_eq!(rebased.entries[0].path, "F:\\photos\\a.jpg");
        assert_eq!(rebased.entries[0].dir, "F:\\photos");
        assert_eq!(rebased.entries[0].rating, 5);
    }
}
