//! Where ffmpeg and ffprobe are likely to be.
//!
//! An app launched from Finder does not inherit a login shell, so its PATH is
//! the bare `/usr/bin:/bin:/usr/sbin:/sbin`. Homebrew installs into
//! `/opt/homebrew/bin`, which is not on that list. Relying on the name alone
//! therefore works under `npm start` and fails in the installed app, which is
//! the worst shape a bug can take. The absolute paths are tried first and the
//! bare name last, as a fallback for a PATH that does have it.

/// `configured` is the folder from Settings, empty when the user has not set
/// one. Candidates are returned most specific first; the caller keeps the first
/// one that exists on disk.
pub fn candidate_paths(name: &str, configured: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let configured = configured.trim().trim_end_matches('/');
    if !configured.is_empty() {
        paths.push(format!("{configured}/{name}"));
    }
    paths.extend(
        [
            // Homebrew on Apple Silicon, then on Intel.
            "/opt/homebrew/bin",
            "/usr/local/bin",
            // MacPorts.
            "/opt/local/bin",
            "/usr/bin",
        ]
        .iter()
        .map(|dir| format!("{dir}/{name}")),
    );
    paths.push(name.to_string());
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn homebrew_comes_before_the_bare_name() {
        let paths = candidate_paths("ffmpeg", "");
        assert_eq!(paths[0], "/opt/homebrew/bin/ffmpeg");
        assert_eq!(paths.last().unwrap(), "ffmpeg");
    }

    #[test]
    fn a_configured_folder_wins() {
        let paths = candidate_paths("ffprobe", "/opt/mine/bin");
        assert_eq!(paths[0], "/opt/mine/bin/ffprobe");
        assert!(paths.contains(&"/opt/homebrew/bin/ffprobe".to_string()));
    }

    #[test]
    fn a_trailing_slash_does_not_double_up() {
        assert_eq!(
            candidate_paths("ffmpeg", "/opt/mine/bin/")[0],
            "/opt/mine/bin/ffmpeg"
        );
    }

    #[test]
    fn whitespace_only_counts_as_unset() {
        assert_eq!(
            candidate_paths("ffmpeg", "   ")[0],
            "/opt/homebrew/bin/ffmpeg"
        );
    }
}
