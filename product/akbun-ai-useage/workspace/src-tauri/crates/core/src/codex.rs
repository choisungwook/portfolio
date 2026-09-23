//! Codex CLI writes each session to `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl`.
//! A token_count event carries the running session total, the last call's
//! usage and the account's rate limit windows, so tokens and subscription
//! limits both come from local files without any login token.

use crate::scan::{json_lines, list_files, parse_time, ParseCache};
use crate::tokens::Record;
use crate::Limit;
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub struct Limits {
    pub ts: i64,
    pub plan: Option<String>,
    pub windows: Vec<Limit>,
}

#[derive(Debug, Clone, Default)]
pub struct Parsed {
    pub records: Vec<Record>,
    pub limits: Option<Limits>,
}

/// OpenAI counts cached input inside input_tokens and reasoning inside
/// output_tokens, so only the cached part is split out.
fn to_record(ts: i64, usage: &Value) -> Record {
    let get = |key: &str| usage[key].as_u64().unwrap_or(0);
    let cached = get("cached_input_tokens");
    Record {
        ts,
        input: get("input_tokens").saturating_sub(cached),
        output: get("output_tokens"),
        cache_read: cached,
        cache_write: 0,
        usd: 0.0,
    }
}

pub fn window_label(minutes: u64) -> String {
    match minutes {
        0 => "limit".into(),
        m if m % 1440 == 0 => format!("{}d", m / 1440),
        m if m % 60 == 0 => format!("{}h", m / 60),
        m => format!("{m}m"),
    }
}

/// Older Codex builds send resets_in_seconds, newer ones resets_at in unix seconds.
pub fn parse_limits(rate_limits: &Value, ts: i64) -> Limits {
    let windows = ["primary", "secondary"]
        .iter()
        .filter_map(|key| {
            let window = &rate_limits[*key];
            let resets_at = window["resets_at"]
                .as_i64()
                .map(|s| s * 1000)
                .or_else(|| window["resets_in_seconds"].as_i64().map(|s| ts + s * 1000));
            Some(Limit {
                label: window_label(window["window_minutes"].as_u64().unwrap_or(0)),
                percent: window["used_percent"].as_f64()?,
                resets_at,
            })
        })
        .collect();
    Limits {
        ts,
        plan: rate_limits["plan_type"].as_str().map(String::from),
        windows,
    }
}

/// The same token_count event repeats when nothing new was billed, so a record
/// is kept only when the session total moved.
pub fn parse_log(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    let mut last_total = None;
    for row in json_lines(text) {
        let payload = &row["payload"];
        if row["type"] != "event_msg" || payload["type"] != "token_count" {
            continue;
        }
        let Some(ts) = parse_time(&row["timestamp"]) else {
            continue;
        };
        let info = &payload["info"];
        if info["last_token_usage"].is_object() {
            let total = info["total_token_usage"]["total_tokens"].as_u64();
            if total.is_none() || total != last_total {
                parsed
                    .records
                    .push(to_record(ts, &info["last_token_usage"]));
            }
            last_total = total;
        }
        if payload["rate_limits"].is_object() {
            parsed.limits = Some(parse_limits(&payload["rate_limits"], ts));
        }
    }
    parsed
}

/// Records from every session, and the newest rate limits across all of them.
pub fn collect(
    home: &Path,
    since_ms: i64,
    cache: &mut ParseCache<Parsed>,
) -> Result<Parsed, String> {
    if !home.exists() {
        return Err(format!("{} not found", home.display()));
    }
    let mut files = Vec::new();
    list_files(&home.join("sessions"), "jsonl", since_ms, &mut files);
    list_files(
        &home.join("archived_sessions"),
        "jsonl",
        since_ms,
        &mut files,
    );
    let mut result = Parsed::default();
    for parsed in cache.parse_all(&files, parse_log) {
        result.records.extend(parsed.records);
        if let Some(limits) = parsed.limits {
            if result.limits.as_ref().is_none_or(|l| limits.ts > l.ts) {
                result.limits = Some(limits);
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn token_count(ts: &str, total: u64, last: Value, rate_limits: Value) -> String {
        json!({
            "timestamp": ts, "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": { "total_token_usage": { "total_tokens": total }, "last_token_usage": last },
                "rate_limits": rate_limits
            }
        })
        .to_string()
    }

    #[test]
    fn splits_cached_input_and_drops_repeats() {
        let last = json!({ "input_tokens": 1000, "cached_input_tokens": 800,
                           "output_tokens": 50, "reasoning_output_tokens": 30 });
        let text = [
            json!({ "timestamp": "2026-09-23T01:00:00Z", "type": "session_meta" }).to_string(),
            token_count("2026-09-23T01:00:01Z", 1050, last.clone(), Value::Null),
            token_count("2026-09-23T01:00:02Z", 1050, last.clone(), Value::Null),
            token_count("2026-09-23T01:00:03Z", 2100, last, Value::Null),
        ]
        .join("\n");
        let parsed = parse_log(&text);
        assert_eq!(parsed.records.len(), 2);
        let r = &parsed.records[0];
        assert_eq!((r.input, r.cache_read, r.output), (200, 800, 50));
    }

    #[test]
    fn keeps_newest_limits_in_both_reset_formats() {
        let old = token_count(
            "2026-09-23T01:00:00Z",
            1,
            Value::Null,
            json!({ "primary": { "used_percent": 5.0, "window_minutes": 300, "resets_in_seconds": 60 } }),
        );
        let new = token_count(
            "2026-09-23T02:00:00Z",
            2,
            Value::Null,
            json!({
                "primary": { "used_percent": 12.5, "window_minutes": 300, "resets_at": 1790000000 },
                "secondary": { "used_percent": 40.0, "window_minutes": 10080, "resets_at": 1790500000 },
                "plan_type": "plus"
            }),
        );
        let limits = parse_log(&format!("{old}\n{new}")).limits.unwrap();
        assert_eq!(limits.plan.as_deref(), Some("plus"));
        let windows: Vec<_> = limits
            .windows
            .iter()
            .map(|w| (w.label.as_str(), w.percent, w.resets_at))
            .collect();
        assert_eq!(
            windows,
            [
                ("5h", 12.5, Some(1_790_000_000_000)),
                ("7d", 40.0, Some(1_790_500_000_000))
            ]
        );

        let older = parse_log(&old).limits.unwrap();
        let ts = chrono::DateTime::parse_from_rfc3339("2026-09-23T01:00:00Z").unwrap();
        assert_eq!(
            older.windows[0].resets_at,
            Some(ts.timestamp_millis() + 60_000)
        );
    }

    #[test]
    fn names_common_windows() {
        assert_eq!(window_label(300), "5h");
        assert_eq!(window_label(10080), "7d");
        assert_eq!(window_label(45), "45m");
    }
}
