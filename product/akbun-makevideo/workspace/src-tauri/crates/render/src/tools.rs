//! Where ffmpeg and ffprobe are likely to be.
//!
//! An app launched from Finder does not inherit a login shell, so its PATH is
//! the bare `/usr/bin:/bin:/usr/sbin:/sbin`. Homebrew installs into
//! `/opt/homebrew/bin`, which is not on that list. Relying on the name alone
//! therefore works under `npm start` and fails in the installed app, which is
//! the worst shape a bug can take.
//!
//! Every candidate that comes out of here is an absolute path, including the
//! ones from PATH. That matters: the caller decides a tool is present by
//! checking whether the file exists, so a bare name left in the list would
//! always look like a hit and the "ffmpeg not found" warning would never
//! appear — right up until the first render failed to spawn.

use crate::workspace::expand_home;

/// The fixed places a Mac keeps these, most likely first.
const KNOWN: &[&str] = &[
    // Homebrew on Apple Silicon, then on Intel.
    "/opt/homebrew/bin",
    "/usr/local/bin",
    // MacPorts.
    "/opt/local/bin",
    "/usr/bin",
];

/// Every absolute path worth testing, most specific first.
///
/// `configured` is the folder from Settings, empty when the user has not set
/// one, and may start with `~`. `path_env` is the value of PATH; pass an empty
/// string to search only the fixed locations. `home` expands a typed `~`.
pub fn candidate_paths(name: &str, configured: &str, path_env: &str, home: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let mut push = |dir: &str| {
        let dir = dir.trim().trim_end_matches('/');
        if dir.is_empty() {
            return;
        }
        let candidate = format!("{dir}/{name}");
        if !paths.contains(&candidate) {
            paths.push(candidate);
        }
    };

    let configured = expand_home(configured, home);
    push(&configured);
    for dir in KNOWN {
        push(dir);
    }
    // PATH last: the fixed locations are where a Mac actually keeps these, and
    // a PATH inherited from a terminal is the case that already worked.
    for dir in path_env.split(':') {
        push(dir);
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn homebrew_comes_first_when_nothing_is_configured() {
        let paths = candidate_paths("ffmpeg", "", "", "");
        assert_eq!(paths[0], "/opt/homebrew/bin/ffmpeg");
    }

    #[test]
    fn a_configured_folder_wins() {
        let paths = candidate_paths("ffprobe", "/opt/mine/bin", "", "");
        assert_eq!(paths[0], "/opt/mine/bin/ffprobe");
        assert!(paths.contains(&"/opt/homebrew/bin/ffprobe".to_string()));
    }

    #[test]
    fn a_configured_folder_may_be_typed_with_a_tilde() {
        let paths = candidate_paths("ffmpeg", "~/bin", "", "/Users/akbun");
        assert_eq!(paths[0], "/Users/akbun/bin/ffmpeg");
    }

    #[test]
    fn a_trailing_slash_does_not_double_up() {
        assert_eq!(
            candidate_paths("ffmpeg", "/opt/mine/bin/", "", "")[0],
            "/opt/mine/bin/ffmpeg"
        );
    }

    #[test]
    fn whitespace_only_counts_as_unset() {
        assert_eq!(
            candidate_paths("ffmpeg", "   ", "", "")[0],
            "/opt/homebrew/bin/ffmpeg"
        );
    }

    /// The bug this replaced: a bare name in the list is a file check that
    /// always passes, so the app reported ffmpeg present on a machine without
    /// it and only failed when a render tried to start.
    #[test]
    fn every_candidate_is_an_absolute_path() {
        let paths = candidate_paths("ffmpeg", "/opt/mine/bin", "/usr/local/bin:/snap/bin", "");
        assert!(
            paths.iter().all(|candidate| candidate.starts_with('/')),
            "a bare name would always look like a hit: {paths:?}"
        );
        assert!(!paths.iter().any(|candidate| candidate == "ffmpeg"));
    }

    #[test]
    fn the_path_environment_is_searched_too() {
        let paths = candidate_paths("ffmpeg", "", "/snap/bin:/opt/tools", "");
        assert!(paths.contains(&"/snap/bin/ffmpeg".to_string()), "{paths:?}");
        assert!(
            paths.contains(&"/opt/tools/ffmpeg".to_string()),
            "{paths:?}"
        );
    }

    #[test]
    fn a_directory_named_twice_is_only_tried_once() {
        // /usr/bin is both a known location and almost always on PATH.
        let paths = candidate_paths("ffmpeg", "/usr/bin", "/usr/bin:/usr/bin", "");
        assert_eq!(
            paths.iter().filter(|p| *p == "/usr/bin/ffmpeg").count(),
            1,
            "{paths:?}"
        );
    }

    #[test]
    fn an_empty_path_entry_is_not_the_root_directory() {
        // "PATH=/usr/bin:" has a trailing empty entry, which as a directory
        // would mean "/ffmpeg".
        let paths = candidate_paths("ffmpeg", "", "/usr/bin::", "");
        assert!(!paths.contains(&"/ffmpeg".to_string()), "{paths:?}");
    }
}
