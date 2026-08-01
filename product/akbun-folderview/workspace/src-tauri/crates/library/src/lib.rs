// The library model: what an entry is, how a folder is scanned, and how a
// rescan keeps the meaning the user attached to a file.
//
// Search, the folder tree and the tag counts are deliberately NOT here. They
// run in the page over its own copy of the entries, because asking the backend
// on every keystroke would be the slow way to do the same thing. See
// src/library.js and adr/2026-08-library-is-what-you-add.md.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::UNIX_EPOCH;

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
}
