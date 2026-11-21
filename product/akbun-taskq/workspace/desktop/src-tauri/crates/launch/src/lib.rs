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

/// `taskq run` prints `taskq starting <percent> <what>` before its ready line (src/cli/run.ts), for the start page.
const STARTING: &str = "taskq starting ";

/// The percent and the step from a starting line, or None for any other line.
pub fn progress_line(line: &str) -> Option<(u8, String)> {
    let rest = line.trim().strip_prefix(STARTING)?;
    let (percent, what) = rest.split_once(' ').unwrap_or((rest, ""));
    let percent: u8 = percent.parse().ok()?;
    (percent <= 100).then(|| (percent, what.trim().to_string()))
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
/// An app opened from Finder runs in `/`, and taskq's home defaults to the current directory, so without a
/// `TASKQ_HOME` from the profile it would try to write `/data`. The app uses `~/.taskq` instead, and makes a
/// relative `TASKQ_HOME` absolute so taskq does not resolve it again from inside that folder.
pub const SCRIPT: &str =
    "export TASKQ_HOME=\"${TASKQ_HOME:-$HOME/.taskq}\"; mkdir -p \"$TASKQ_HOME\" && cd \"$TASKQ_HOME\" && export TASKQ_HOME=\"$PWD\" && exec \"$0\" run 2>&1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_starting_lines_only() {
        assert_eq!(progress_line("taskq starting 40 opening the database"), Some((40, "opening the database".to_string())));
        assert_eq!(progress_line("taskq starting 100"), Some((100, String::new())));
        assert_eq!(progress_line("taskq starting 140 too much"), None);
        assert_eq!(progress_line("hello from .zshrc"), None);
    }

    #[test]
    fn ready_url_takes_only_the_loopback_address() {
        assert_eq!(ready_url("taskq running at http://127.0.0.1:4317/#token=ab"), Some("http://127.0.0.1:4317/#token=ab"));
        assert_eq!(ready_url("taskq: config loaded"), None);
        assert_eq!(ready_url("taskq running at https://example.com/"), None);
        assert_eq!(ready_url("taskq running at http://127.0.0.1:@example.com/"), None);
    }

    #[test]
    fn script_runs_taskq_in_a_writable_home() {
        let tmp = std::env::temp_dir().join(format!("taskq-launch-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let fake = tmp.join("taskq");
        std::fs::write(&fake, "#!/bin/sh\necho \"$TASKQ_HOME|$(pwd -P)|$1\"\n").unwrap();
        std::process::Command::new("chmod").arg("+x").arg(&fake).status().unwrap();
        let run = |home: Option<&str>| {
            let mut cmd = std::process::Command::new("/bin/sh");
            cmd.args(["-c", SCRIPT]).arg(&fake).current_dir("/").env("HOME", &tmp).env_remove("TASKQ_HOME");
            if let Some(home) = home {
                cmd.env("TASKQ_HOME", home);
            }
            String::from_utf8(cmd.output().unwrap().stdout).unwrap()
        };
        let tmp_real = std::fs::canonicalize(&tmp).unwrap();
        let default = tmp.join(".taskq");
        assert_eq!(run(None).trim(), format!("{}|{}|run", default.display(), tmp_real.join(".taskq").display()));
        let custom = tmp.join("custom");
        assert_eq!(run(custom.to_str()).trim(), format!("{}|{}|run", custom.display(), tmp_real.join("custom").display()));
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn login_shell_falls_back_to_zsh() {
        assert_eq!(login_shell(Some("/opt/homebrew/bin/bash")), "/opt/homebrew/bin/bash");
        assert_eq!(login_shell(Some("/opt/homebrew/bin/fish")), "/bin/zsh");
        assert_eq!(login_shell(None), "/bin/zsh");
    }
}
