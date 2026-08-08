//! Project names and the shape of the workspace folder.
//!
//! A project is a directory under the workspace root holding one project file.
//! The media it uses is **not** in there: a project stores absolute paths to
//! files wherever the user keeps them, and importing never copies. See
//! wiki/architecture/workspace-and-files.md.
//!
//! Only the naming rules live here, because a name typed by a user becomes a
//! directory on disk and that is worth testing without a file system.

use std::path::{Path, PathBuf};

/// The one file inside a project directory.
pub const PROJECT_FILE: &str = "project.akbunvideo";

/// Under the user's Documents folder. Rust resolves the home part; this is the
/// tail so the page and the tests can agree on it without one.
pub const DEFAULT_FOLDER: &str = "akbun-makevideo";

/// The managed project directory that owns `project_path`.
///
/// Deletion uses this instead of trusting a path from the page. Only an actual
/// `project.akbunvideo` one directory below the configured workspace may make
/// its parent a deletion target. Canonical paths also reject symlinks that
/// point outside the workspace.
pub fn managed_project_dir(root: &Path, project_path: &Path) -> Result<PathBuf, String> {
    if project_path.file_name().and_then(|name| name.to_str()) != Some(PROJECT_FILE) {
        return Err("only projects created in the workspace can be deleted".into());
    }
    let root = std::fs::canonicalize(root)
        .map_err(|error| format!("cannot open the workspace folder: {error}"))?;
    let project = std::fs::canonicalize(project_path)
        .map_err(|error| format!("cannot open the project: {error}"))?;
    let dir = project
        .parent()
        .ok_or("the project has no folder")?
        .to_path_buf();
    if dir.parent() != Some(root.as_path()) {
        return Err("only projects created in the workspace can be deleted".into());
    }
    Ok(dir)
}

/// Expand a leading `~` against the home directory.
///
/// A path a user types into a settings field is a path they would type in a
/// shell, and the docs and the placeholder both write the default as
/// `~/Documents/akbun-makevideo`. Without this, typing that back in makes a
/// directory literally called `~` next to the app's working directory.
///
/// `~user` is deliberately not handled: resolving another account's home needs
/// the password database, and nobody types it into this field.
pub fn expand_home(path: &str, home: &str) -> String {
    let path = path.trim();
    if home.is_empty() || !path.starts_with('~') {
        return path.to_string();
    }
    let home = home.trim_end_matches('/');
    match path {
        "~" => home.to_string(),
        rest if rest.starts_with("~/") => format!("{home}/{}", &rest[2..]),
        // ~someone-else: left alone rather than mangled.
        other => other.to_string(),
    }
}

/// Windows reserves these whatever the extension, and a directory named for one
/// cannot be created. macOS does not care, but a project folder that will not
/// survive being copied to another machine is worth refusing here.
const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A typed project name, checked before it becomes a directory.
///
/// This rejects rather than rewrites. Silently turning `../../etc` into
/// `etcetc` would create a project the user did not ask for under a name they
/// did not choose; saying why is better.
pub fn sanitize_project_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err("a project needs a name".into());
    }
    if name.len() > 80 {
        return Err("that name is too long, keep it under 80 characters".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("a project name cannot contain / or \\".into());
    }
    if name.starts_with('.') {
        return Err("a project name cannot start with a dot".into());
    }
    // Trailing dots and spaces are silently dropped by Windows, so a project
    // saved as "edit " would be reopened as "edit" and look like it moved.
    if name.ends_with('.') || name.ends_with(' ') {
        return Err("a project name cannot end with a dot or a space".into());
    }
    if let Some(bad) = name
        .chars()
        .find(|c| ":*?\"<>|".contains(*c) || c.is_control())
    {
        return Err(format!("a project name cannot contain {bad:?}"));
    }
    if RESERVED.contains(&name.to_ascii_lowercase().as_str()) {
        return Err(format!("{name} is a reserved name on Windows"));
    }
    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_workspace() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "makevideo-workspace-{}-{unique}",
            std::process::id()
        ))
    }

    #[test]
    fn deletion_targets_the_folder_that_contains_project_and_proxies() {
        let root = temporary_workspace();
        let dir = root.join("summer trip");
        let project = dir.join(PROJECT_FILE);
        std::fs::create_dir_all(dir.join("proxies")).unwrap();
        std::fs::write(&project, b"{}").unwrap();
        std::fs::write(dir.join("proxies/as1.mp4"), b"proxy").unwrap();

        assert_eq!(
            managed_project_dir(&root, &project).unwrap(),
            std::fs::canonicalize(&dir).unwrap()
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn deletion_rejects_projects_outside_the_workspace() {
        let root = temporary_workspace();
        let outside = temporary_workspace().with_extension("outside");
        let project = outside.join(PROJECT_FILE);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(&project, b"{}").unwrap();

        assert!(managed_project_dir(&root, &project).is_err());
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn an_ordinary_name_is_kept_as_typed() {
        assert_eq!(
            sanitize_project_name("  summer trip  ").unwrap(),
            "summer trip"
        );
        assert_eq!(
            sanitize_project_name("2026-08 편집").unwrap(),
            "2026-08 편집"
        );
    }

    #[test]
    fn a_name_cannot_walk_out_of_the_workspace() {
        assert!(sanitize_project_name("../escape").is_err());
        assert!(sanitize_project_name("a/b").is_err());
        assert!(sanitize_project_name("a\\b").is_err());
        // Not rewritten into something else, refused.
        assert!(sanitize_project_name("..").is_err());
    }

    #[test]
    fn a_hidden_directory_is_not_a_project() {
        assert!(sanitize_project_name(".hidden").is_err());
    }

    #[test]
    fn names_windows_would_quietly_change_are_refused() {
        // A trailing space is trimmed before the check, so it is not a problem.
        assert_eq!(sanitize_project_name("edit ").unwrap(), "edit");
        assert!(sanitize_project_name("edit.").is_err());
        assert!(sanitize_project_name("con").is_err());
        assert!(sanitize_project_name("COM1").is_err());
        assert!(sanitize_project_name("a:b").is_err());
        assert!(sanitize_project_name("a?b").is_err());
    }

    #[test]
    fn an_empty_name_says_so() {
        assert!(sanitize_project_name("").is_err());
        assert!(sanitize_project_name("   ").is_err());
    }

    #[test]
    fn a_typed_tilde_reaches_the_home_directory() {
        // The docs and the settings placeholder both write the default this
        // way, so it is the exact string a user is most likely to type back in.
        assert_eq!(
            expand_home("~/Documents/akbun-makevideo", "/Users/akbun"),
            "/Users/akbun/Documents/akbun-makevideo"
        );
        assert_eq!(expand_home("~", "/Users/akbun"), "/Users/akbun");
        assert_eq!(
            expand_home("  ~/edits  ", "/Users/akbun"),
            "/Users/akbun/edits"
        );
    }

    #[test]
    fn a_trailing_slash_on_home_does_not_double_up() {
        assert_eq!(
            expand_home("~/edits", "/Users/akbun/"),
            "/Users/akbun/edits"
        );
    }

    #[test]
    fn an_absolute_path_is_left_alone() {
        assert_eq!(
            expand_home("/Volumes/work", "/Users/akbun"),
            "/Volumes/work"
        );
        assert_eq!(expand_home("", "/Users/akbun"), "");
    }

    #[test]
    fn another_users_home_is_not_guessed_at() {
        // Resolving ~someone needs the password database, and the alternative
        // of mangling it into /Users/akbunsomeone would be worse than leaving
        // it to fail visibly.
        assert_eq!(expand_home("~bob/edits", "/Users/akbun"), "~bob/edits");
    }

    #[test]
    fn with_no_home_to_expand_against_nothing_changes() {
        assert_eq!(expand_home("~/edits", ""), "~/edits");
    }

    #[test]
    fn a_control_character_is_not_a_name() {
        assert!(sanitize_project_name("a\nb").is_err());
        assert!(sanitize_project_name("a\0b").is_err());
    }

    /// Importing references media, it never copies it into the project folder.
    /// This is the test that should fail first if somebody changes that: a
    /// project keeps the absolute path the file actually has, and a file far
    /// outside the workspace survives a round trip untouched.
    #[test]
    fn a_project_points_at_media_where_it_really_lives() {
        let far_away = "/Volumes/Backup 2019/여행/DSC_0001.MOV";
        let text = format!(
            r#"{{
                "settings": {{"width": 1920, "height": 1080, "fps": 30}},
                "assets": [{{"id": "a1", "path": "{far_away}", "kind": "video", "hasAudio": true}}],
                "tracks": [{{"id": "t1", "kind": "video", "clips": [
                    {{"id": "c1", "assetId": "a1", "startMs": 0, "inMs": 0, "outMs": 1000}}
                ]}}]
            }}"#
        );
        let project: crate::Project = serde_json::from_str(&text).unwrap();
        assert_eq!(project.assets[0].path, far_away);

        let written = serde_json::to_string(&project).unwrap();
        let reopened: crate::Project = serde_json::from_str(&written).unwrap();
        assert_eq!(
            reopened.assets[0].path, far_away,
            "a save must not rewrite a media path into the project folder"
        );
        assert!(
            !written.contains(PROJECT_FILE),
            "nothing in a project file should point back inside the project folder"
        );
    }
}
