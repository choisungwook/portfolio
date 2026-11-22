//! What the desktop shell needs to know about `aimem serve`, without Tauri, so `cargo test -p aimemory-launch`
//! compiles nothing else and runs without a webview or system GTK/WebKit packages.

/// Extracts the loopback address printed by `aimem serve --port 0`.
/// Only `http://127.0.0.1:<digits>/...` counts so arbitrary lines from a login shell profile can never redirect the window.
pub fn ready_url(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let idx = trimmed.find("http://127.0.0.1:")?;
    let url = trimmed[idx..].split_whitespace().next()?;
    let after = url.strip_prefix("http://127.0.0.1:")?;
    let port = after.split('/').next()?;
    // Reject `http://127.0.0.1:@evil.com/` by ensuring the port is strictly ASCII digits followed by `/`.
    (after.contains('/') && !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())).then_some(url)
}

/// The login shell used to launch `aimem`. Finder-launched apps have a minimal PATH, so using the user's
/// interactive login shell preserves PATH entries needed for command tokenizers and tools.
pub fn login_shell(shell: Option<&str>) -> &str {
    match shell {
        Some(path) if path.ends_with("/zsh") || path.ends_with("/bash") => path,
        _ => "/bin/zsh",
    }
}

/// Run by the login shell with the bundled `aimem` binary path as `$0`.
/// Uses `--port 0` so the OS picks a free loopback port and never collides with another running instance.
pub const SCRIPT: &str =
    "export AIMEMORY_HOME=\"${AIMEMORY_HOME:-$HOME/.aimemory}\"; mkdir -p \"$AIMEMORY_HOME\" && exec \"$0\" serve --port 0 2>&1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_url_accepts_only_loopback_with_numeric_port() {
        assert_eq!(
            ready_url("http://127.0.0.1:7788/?token=abcd1234"),
            Some("http://127.0.0.1:7788/?token=abcd1234")
        );
        assert_eq!(
            ready_url("aimemory running at http://127.0.0.1:51234/?token=ff00"),
            Some("http://127.0.0.1:51234/?token=ff00")
        );
        assert_eq!(ready_url("hello from .zshrc"), None);
        assert_eq!(ready_url("https://example.com/?token=ab"), None);
        assert_eq!(ready_url("http://127.0.0.1:@example.com/"), None);
        assert_eq!(ready_url("http://127.0.0.1:notaport/"), None);
    }

    #[test]
    fn script_runs_aimem_serve_with_writable_home() {
        let tmp = std::env::temp_dir().join(format!("aimemory-launch-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let fake = tmp.join("aimem");
        std::fs::write(&fake, "#!/bin/sh\necho \"$AIMEMORY_HOME|$1|$2|$3\"\n").unwrap();
        std::process::Command::new("chmod").arg("+x").arg(&fake).status().unwrap();
        let run = |home: Option<&str>| {
            let mut cmd = std::process::Command::new("/bin/sh");
            cmd.args(["-c", SCRIPT])
                .arg(&fake)
                .current_dir("/")
                .env("HOME", &tmp)
                .env_remove("AIMEMORY_HOME");
            if let Some(home) = home {
                cmd.env("AIMEMORY_HOME", home);
            }
            String::from_utf8(cmd.output().unwrap().stdout).unwrap()
        };
        let default = tmp.join(".aimemory");
        assert_eq!(run(None).trim(), format!("{}|serve|--port|0", default.display()));
        let custom = tmp.join("custom");
        assert_eq!(run(custom.to_str()).trim(), format!("{}|serve|--port|0", custom.display()));
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn login_shell_falls_back_to_zsh() {
        assert_eq!(login_shell(Some("/opt/homebrew/bin/bash")), "/opt/homebrew/bin/bash");
        assert_eq!(login_shell(Some("/bin/zsh")), "/bin/zsh");
        assert_eq!(login_shell(Some("/opt/homebrew/bin/fish")), "/bin/zsh");
        assert_eq!(login_shell(None), "/bin/zsh");
    }
}
