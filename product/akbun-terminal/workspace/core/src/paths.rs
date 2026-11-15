//! Where the daemon keeps its files.
//!
//! Every client has to find the same socket without being told, so the answer
//! is computed here once from the environment. The `AKBUN_TERMINAL_*` variables
//! exist so a test, or a second instance, can live somewhere else entirely.

use std::path::PathBuf;

/// The directory holding the project tree, the socket, the log and the agent
/// rules.
pub fn data_dir() -> PathBuf {
    data_dir_from(&|name| std::env::var(name).ok(), cfg!(target_os = "macos"))
}

/// The socket every client connects to.
pub fn socket_path() -> PathBuf {
    socket_path_from(&|name| std::env::var(name).ok(), cfg!(target_os = "macos"))
}

/// Where a detached daemon's stdout and stderr go.
pub fn log_path() -> PathBuf {
    data_dir().join("core.log")
}

/// The directory of agent rule files.
pub fn agents_dir() -> PathBuf {
    data_dir().join("agents")
}

type Env<'a> = &'a dyn Fn(&str) -> Option<String>;

/// An empty variable counts as unset, because `FOO= cmd` is how people clear
/// one for a single command.
fn var(env: Env, name: &str) -> Option<String> {
    env(name).filter(|value| !value.is_empty())
}

fn data_dir_from(env: Env, macos: bool) -> PathBuf {
    if let Some(dir) = var(env, "AKBUN_TERMINAL_HOME") {
        return PathBuf::from(dir);
    }
    let home = var(env, "HOME").unwrap_or_else(|| "/".to_string());
    if macos {
        // Where the desktop app has always kept its state.
        return PathBuf::from(home).join("Library/Application Support/io.akbun.terminal");
    }
    match var(env, "XDG_DATA_HOME") {
        Some(base) => PathBuf::from(base).join("akbun-terminal"),
        None => PathBuf::from(home).join(".local/share/akbun-terminal"),
    }
}

fn socket_path_from(env: Env, macos: bool) -> PathBuf {
    match var(env, "AKBUN_TERMINAL_SOCKET") {
        Some(path) => PathBuf::from(path),
        None => data_dir_from(env, macos).join("core.sock"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn the_home_override_wins_everywhere() {
        let lookup = env(&[("AKBUN_TERMINAL_HOME", "/t/h"), ("HOME", "/u")]);
        assert_eq!(data_dir_from(&lookup, true), PathBuf::from("/t/h"));
        assert_eq!(data_dir_from(&lookup, false), PathBuf::from("/t/h"));
        assert_eq!(socket_path_from(&lookup, false), PathBuf::from("/t/h/core.sock"));
    }

    #[test]
    fn macos_keeps_the_directory_the_desktop_app_already_uses() {
        let lookup = env(&[("HOME", "/Users/a")]);
        assert_eq!(
            data_dir_from(&lookup, true),
            PathBuf::from("/Users/a/Library/Application Support/io.akbun.terminal")
        );
    }

    #[test]
    fn linux_follows_xdg_and_falls_back_to_local_share() {
        let lookup = env(&[("HOME", "/home/a"), ("XDG_DATA_HOME", "/x")]);
        assert_eq!(data_dir_from(&lookup, false), PathBuf::from("/x/akbun-terminal"));
        let lookup = env(&[("HOME", "/home/a"), ("XDG_DATA_HOME", "")]);
        assert_eq!(
            data_dir_from(&lookup, false),
            PathBuf::from("/home/a/.local/share/akbun-terminal")
        );
    }

    #[test]
    fn the_socket_override_is_independent_of_the_data_dir() {
        let lookup = env(&[("AKBUN_TERMINAL_SOCKET", "/s/c.sock"), ("HOME", "/u")]);
        assert_eq!(socket_path_from(&lookup, false), PathBuf::from("/s/c.sock"));
        assert_eq!(
            data_dir_from(&lookup, false),
            PathBuf::from("/u/.local/share/akbun-terminal")
        );
    }
}
