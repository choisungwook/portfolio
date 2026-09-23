//! Claude Code writes every assistant message with its token usage to
//! `<config>/projects/**/*.jsonl`. That covers Pro, Max, Team, Enterprise and
//! API key logins alike, because the CLI writes the log, not the account.
//!
//! Subscription limits live only on the server. The OAuth usage endpoint is
//! the one Claude Code's /usage calls; reading it is opt-in because it reuses
//! the Claude Code login token.

use crate::scan::{json_lines, list_files, parse_time, ParseCache};
use crate::tokens::Record;
use crate::Limit;
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

#[derive(Debug, Clone)]
pub struct Message {
    pub id: String,
    pub record: Record,
}

pub fn claude_dirs(config_dir: Option<String>, home: &PathBuf) -> Vec<PathBuf> {
    match config_dir {
        Some(dirs) => dirs.split(',').map(|d| PathBuf::from(d.trim())).collect(),
        None => vec![home.join(".claude"), home.join(".config").join("claude")],
    }
}

pub fn parse_log(text: &str) -> Vec<Message> {
    json_lines(text)
        .filter_map(|row| {
            if row["type"] != "assistant" || row["message"]["model"] == "<synthetic>" {
                return None;
            }
            let usage = row["message"]["usage"].as_object()?;
            let get = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
            Some(Message {
                id: format!(
                    "{}:{}",
                    row["message"]["id"].as_str().unwrap_or(""),
                    row["requestId"].as_str().unwrap_or("")
                ),
                record: Record {
                    ts: parse_time(&row["timestamp"])?,
                    input: get("input_tokens"),
                    output: get("output_tokens"),
                    cache_read: get("cache_read_input_tokens"),
                    cache_write: get("cache_creation_input_tokens"),
                    usd: 0.0,
                },
            })
        })
        .collect()
}

/// A resumed or forked session logs old messages again, so records are
/// deduped on message id plus request id across files.
pub fn dedupe(lists: Vec<Vec<Message>>) -> Vec<Record> {
    let mut seen = HashSet::new();
    let mut records = Vec::new();
    for message in lists.into_iter().flatten() {
        if message.id != ":" && !seen.insert(message.id) {
            continue;
        }
        records.push(message.record);
    }
    records
}

pub fn collect_records(
    dirs: &[PathBuf],
    since_ms: i64,
    cache: &mut ParseCache<Vec<Message>>,
) -> Vec<Record> {
    let mut files = Vec::new();
    for dir in dirs {
        list_files(&dir.join("projects"), "jsonl", since_ms, &mut files);
    }
    dedupe(cache.parse_all(&files, parse_log))
}

pub fn parse_limits(json: &Value) -> Vec<Limit> {
    [
        ("five_hour", "5h"),
        ("seven_day", "7d"),
        ("seven_day_sonnet", "7d Sonnet"),
        ("seven_day_opus", "7d Opus"),
    ]
    .iter()
    .filter_map(|(key, label)| {
        let window = &json[*key];
        Some(Limit {
            label: label.to_string(),
            percent: window["utilization"].as_f64()?,
            resets_at: parse_time(&window["resets_at"]),
        })
    })
    .collect()
}

fn token_from_credentials(text: &str) -> Option<String> {
    let json: Value = serde_json::from_str(text).ok()?;
    json["claudeAiOauth"]["accessToken"]
        .as_str()
        .map(String::from)
}

/// Same order Claude Code uses: env, credentials file, macOS keychain.
pub fn read_token(env_token: Option<String>, dirs: &[PathBuf]) -> Option<String> {
    if let Some(token) = env_token {
        return Some(token);
    }
    for dir in dirs {
        if let Ok(text) = std::fs::read_to_string(dir.join(".credentials.json")) {
            if let Some(token) = token_from_credentials(&text) {
                return Some(token);
            }
        }
    }
    if !cfg!(target_os = "macos") {
        return None;
    }
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    token_from_credentials(String::from_utf8_lossy(&output.stdout).trim())
}

pub fn fetch_limits(agent: &ureq::Agent, token: &str) -> Result<Vec<Limit>, String> {
    let json: Value = agent
        .get(USAGE_URL)
        .header("Authorization", &format!("Bearer {token}"))
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.0.0")
        .call()
        .map_err(|e| format!("Claude usage API: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("Claude usage API: {e}"))?;
    Ok(parse_limits(&json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn assistant(id: &str, ts: &str, usage: Value, model: &str) -> String {
        json!({
            "type": "assistant", "timestamp": ts, "requestId": format!("req_{id}"),
            "message": { "id": format!("msg_{id}"), "model": model, "usage": usage }
        })
        .to_string()
    }

    #[test]
    fn keeps_assistant_usage_only() {
        let text = [
            json!({ "type": "user", "timestamp": "2026-09-23T01:00:00Z" }).to_string(),
            assistant(
                "a",
                "2026-09-23T01:00:01Z",
                json!({ "input_tokens": 10, "output_tokens": 20,
                        "cache_read_input_tokens": 300, "cache_creation_input_tokens": 40 }),
                "claude-opus-5-5",
            ),
            assistant(
                "b",
                "2026-09-23T01:00:02Z",
                json!({ "input_tokens": 1 }),
                "<synthetic>",
            ),
            "not json".into(),
        ]
        .join("\n");
        let messages = parse_log(&text);
        assert_eq!(messages.len(), 1);
        let r = &messages[0].record;
        assert_eq!(
            (r.input, r.output, r.cache_read, r.cache_write),
            (10, 20, 300, 40)
        );
    }

    #[test]
    fn counts_a_message_logged_twice_once() {
        let line = assistant(
            "same",
            "2026-09-23T01:00:00Z",
            json!({ "input_tokens": 5 }),
            "m",
        );
        let other = assistant(
            "other",
            "2026-09-23T01:01:00Z",
            json!({ "input_tokens": 1 }),
            "m",
        );
        let records = dedupe(vec![
            parse_log(&line),
            parse_log(&format!("{line}\n{other}")),
        ]);
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn reads_present_limit_windows() {
        let limits = parse_limits(&json!({
            "five_hour": { "utilization": 33.0, "resets_at": "2026-04-11T07:00:00.528743+00:00" },
            "seven_day": { "utilization": 13.0, "resets_at": "2026-04-17T00:59:59Z" },
            "seven_day_opus": null,
            "seven_day_sonnet": { "utilization": 1.0, "resets_at": "2026-04-16T03:00:00Z" }
        }));
        let labels: Vec<_> = limits
            .iter()
            .map(|l| (l.label.as_str(), l.percent))
            .collect();
        assert_eq!(labels, [("5h", 33.0), ("7d", 13.0), ("7d Sonnet", 1.0)]);
        assert_eq!(limits[0].resets_at, Some(1_775_890_800_528));
    }

    #[test]
    fn reads_token_from_credentials_json() {
        let text = r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat","refreshToken":"r"}}"#;
        assert_eq!(token_from_credentials(text).as_deref(), Some("sk-ant-oat"));
    }
}
