//! Kiro keeps no local usage log and has no public usage API, so the app runs
//! the CLI's /usage in non-interactive mode and parses the printed card:
//!
//! ```text
//! Estimated Usage | resets on 2026-09-01 | KIRO PRO
//! Credits (10 of 100 covered in plan)
//! ████ 10%
//! ```

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const RUN_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq)]
pub struct Usage {
    pub plan: Option<String>,
    pub used: f64,
    pub limit: f64,
    pub percent: f64,
    pub resets_on: Option<chrono::NaiveDate>,
}

pub fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

fn number(text: &str) -> Option<f64> {
    text.trim().replace(',', "").parse().ok()
}

pub fn parse_usage(raw: &str) -> Option<Usage> {
    let text = strip_ansi(raw);
    let mut plan = None;
    let mut resets_on = None;
    let mut credits = None;
    let mut percent = None;
    for line in text.lines().map(str::trim) {
        if let Some(rest) = line.strip_prefix("Estimated Usage") {
            let parts: Vec<_> = rest.split('|').map(str::trim).collect();
            if let Some(date) = parts.iter().find_map(|p| p.strip_prefix("resets on ")) {
                resets_on = chrono::NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d").ok();
            }
            plan = parts
                .last()
                .filter(|p| !p.is_empty() && !p.starts_with("resets"))
                .map(|p| p.to_string());
        } else if let Some(rest) = line.strip_prefix("Credits (") {
            let inner = rest.split(" covered in plan)").next()?;
            let (used, limit) = inner.split_once(" of ")?;
            credits = Some((number(used)?, number(limit)?));
        } else if let Some(value) = line.strip_suffix('%') {
            percent = value.rsplit(char::is_whitespace).next().and_then(number);
        }
    }
    let (used, limit) = credits?;
    let fallback = if limit > 0.0 {
        used / limit * 100.0
    } else {
        0.0
    };
    Some(Usage {
        plan,
        used,
        limit,
        percent: percent.unwrap_or(fallback),
        resets_on,
    })
}

/// Apps launched from Finder get a bare PATH, so the usual install locations
/// are added before looking up the CLI.
pub fn cli_path(current: Option<String>, home: &Path) -> String {
    let mut dirs: Vec<PathBuf> = current
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    dirs.extend([
        home.join(".local/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
    ]);
    std::env::join_paths(dirs)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn run_usage(command: &str, path_env: &str) -> Result<Usage, String> {
    let mut child = Command::new(command)
        .args(["chat", "/usage", "--no-interactive", "--wrap", "never"])
        .env("PATH", path_env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => format!("{command} not found"),
            _ => e.to_string(),
        })?;
    let started = Instant::now();
    while child.try_wait().map_err(|e| e.to_string())?.is_none() {
        if started.elapsed() > RUN_TIMEOUT {
            let _ = child.kill();
            return Err(format!("{command} timed out"));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let mut output = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut output);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut output);
    }
    parse_usage(&output).ok_or_else(|| format!("{command} /usage printed no credits line"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_plan_credits_percent_and_reset() {
        let usage = parse_usage(
            "\u{1b}[1mEstimated Usage | resets on 2026-10-01 | KIRO PRO+\u{1b}[0m\n\
             Credits (1,233.74 of 2000 covered in plan)\n\
             \u{1b}[32m████ 61%\u{1b}[0m\n",
        )
        .unwrap();
        assert_eq!(usage.plan.as_deref(), Some("KIRO PRO+"));
        assert_eq!(
            (usage.used, usage.limit, usage.percent),
            (1233.74, 2000.0, 61.0)
        );
        assert_eq!(
            usage.resets_on,
            chrono::NaiveDate::from_ymd_opt(2026, 10, 1)
        );
    }

    #[test]
    fn computes_percent_without_the_bar() {
        let usage = parse_usage("Credits (10 of 100 covered in plan)").unwrap();
        assert_eq!(usage.percent, 10.0);
        assert_eq!(usage.plan, None);
    }

    #[test]
    fn rejects_unrelated_output() {
        assert_eq!(parse_usage("error: not logged in"), None);
    }
}
