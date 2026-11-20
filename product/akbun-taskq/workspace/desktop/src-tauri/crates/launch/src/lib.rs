//! What the window needs to know about `taskq run`, without Tauri, so `cargo test -p taskq-launch` builds nothing else.

/// `taskq run` prints this line once the API listens (src/cli/run.ts).
const READY: &str = "taskq running at ";

/// The address in taskq's ready line. Only a loopback address counts: the line comes through the user's login shell,
/// and the window must not be sent anywhere else by what a shell profile prints.
pub fn ready_url(line: &str) -> Option<&str> {
    let url = line.split(READY).nth(1)?.trim();
    let after = url.strip_prefix("http://127.0.0.1:")?;
    let port = after.split('/').next()?;
    // "127.0.0.1:@host/" would be a user name for another host, so the port must be digits up to a slash.
    (after.contains('/') && !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())).then_some(url)
}

/// The login shell that starts taskq. An app opened from Finder has a bare PATH, so the bots would not find `aws`,
/// `git`, `codex` or `kiro-cli`; the user's interactive login shell has the PATH their terminal has.
// ponytail: zsh and bash only, other shells (fish) fall back to zsh; read their syntax if someone needs it.
pub fn login_shell(shell: Option<&str>) -> &str {
    match shell {
        Some(path) if path.ends_with("/zsh") || path.ends_with("/bash") => path,
        _ => "/bin/zsh",
    }
}

/// Run by the login shell with the taskq path as `$0`. stderr joins stdout so a failed start can be shown.
pub const SCRIPT: &str = "exec \"$0\" run 2>&1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_url_takes_only_the_loopback_address() {
        assert_eq!(ready_url("taskq running at http://127.0.0.1:4317/#token=ab"), Some("http://127.0.0.1:4317/#token=ab"));
        assert_eq!(ready_url("taskq: config loaded"), None);
        assert_eq!(ready_url("taskq running at https://example.com/"), None);
        assert_eq!(ready_url("taskq running at http://127.0.0.1:@example.com/"), None);
    }

    #[test]
    fn login_shell_falls_back_to_zsh() {
        assert_eq!(login_shell(Some("/opt/homebrew/bin/bash")), "/opt/homebrew/bin/bash");
        assert_eq!(login_shell(Some("/opt/homebrew/bin/fish")), "/bin/zsh");
        assert_eq!(login_shell(None), "/bin/zsh");
    }
}
