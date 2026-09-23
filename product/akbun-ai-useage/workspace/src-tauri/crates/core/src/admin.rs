//! Organization usage from the Anthropic and OpenAI Admin APIs. This is the
//! only source for Enterprise or API usage that did not go through a CLI on
//! this machine: other members, other machines, direct API calls. Both need
//! an admin key; a regular API key is refused.

use crate::scan::parse_time;
use crate::tokens::{Record, DAY_MS};
use serde_json::Value;

const MAX_PAGES: usize = 10;

fn get_json(agent: &ureq::Agent, url: &str, headers: &[(&str, String)]) -> Result<Value, String> {
    let mut request = agent.get(url);
    for (key, value) in headers {
        request = request.header(*key, value);
    }
    let host = url.split('/').nth(2).unwrap_or(url);
    request
        .call()
        .map_err(|e| format!("{host}: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("{host}: {e}"))
}

/// Both APIs page with has_more and next_page.
fn fetch_pages(
    agent: &ureq::Agent,
    url: &str,
    headers: &[(&str, String)],
) -> Result<Vec<Value>, String> {
    let mut pages = Vec::new();
    let mut next = Some(url.to_string());
    while let Some(current) = next.take() {
        let page = get_json(agent, &current, headers)?;
        if page["has_more"] == true && pages.len() + 1 < MAX_PAGES {
            if let Some(token) = page["next_page"].as_str() {
                next = Some(format!("{url}&page={token}"));
            }
        }
        pages.push(page);
    }
    Ok(pages)
}

fn buckets(page: &Value) -> impl Iterator<Item = &Value> {
    page["data"].as_array().into_iter().flatten()
}

fn results(bucket: &Value) -> impl Iterator<Item = &Value> {
    bucket["results"].as_array().into_iter().flatten()
}

fn u(value: &Value) -> u64 {
    value.as_u64().unwrap_or(0)
}

pub fn parse_anthropic_usage(page: &Value) -> Vec<Record> {
    buckets(page)
        .filter_map(|bucket| {
            let mut record = Record {
                ts: parse_time(&bucket["starting_at"])?,
                ..Default::default()
            };
            for result in results(bucket) {
                record.input += u(&result["uncached_input_tokens"]);
                record.output += u(&result["output_tokens"]);
                record.cache_read += u(&result["cache_read_input_tokens"]);
                record.cache_write += u(&result["cache_creation"]["ephemeral_1h_input_tokens"])
                    + u(&result["cache_creation"]["ephemeral_5m_input_tokens"]);
            }
            Some(record)
        })
        .collect()
}

/// amount is a decimal string in cents.
pub fn parse_anthropic_cost(page: &Value) -> Vec<Record> {
    buckets(page)
        .filter_map(|bucket| {
            let usd = results(bucket)
                .filter_map(|r| r["amount"].as_str().and_then(|a| a.parse::<f64>().ok()))
                .sum::<f64>()
                / 100.0;
            Some(Record {
                ts: parse_time(&bucket["starting_at"])?,
                usd,
                ..Default::default()
            })
        })
        .collect()
}

pub fn parse_openai_usage(page: &Value) -> Vec<Record> {
    buckets(page)
        .filter_map(|bucket| {
            let mut record = Record {
                ts: bucket["start_time"].as_i64()? * 1000,
                ..Default::default()
            };
            for result in results(bucket) {
                let cached = u(&result["input_cached_tokens"]);
                record.input += u(&result["input_tokens"]).saturating_sub(cached);
                record.output += u(&result["output_tokens"]);
                record.cache_read += cached;
            }
            Some(record)
        })
        .collect()
}

pub fn parse_openai_cost(page: &Value) -> Vec<Record> {
    buckets(page)
        .filter_map(|bucket| {
            let usd = results(bucket)
                .filter_map(|r| r["amount"]["value"].as_f64())
                .sum();
            Some(Record {
                ts: bucket["start_time"].as_i64()? * 1000,
                usd,
                ..Default::default()
            })
        })
        .collect()
}

/// Daily buckets start at UTC midnight 30 days back.
fn since_day(now: i64) -> chrono::DateTime<chrono::Utc> {
    let start = chrono::DateTime::from_timestamp_millis(now - 30 * DAY_MS).unwrap_or_default();
    start
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap_or_default()
        .and_utc()
}

pub fn fetch_anthropic(agent: &ureq::Agent, key: &str, now: i64) -> Result<Vec<Record>, String> {
    let base = "https://api.anthropic.com/v1/organizations";
    let headers = [
        ("x-api-key", key.to_string()),
        ("anthropic-version", "2023-06-01".to_string()),
    ];
    let query = format!(
        "starting_at={}&bucket_width=1d&limit=31",
        since_day(now).format("%Y-%m-%dT%H:%M:%SZ")
    );
    let mut records = Vec::new();
    for page in fetch_pages(
        agent,
        &format!("{base}/usage_report/messages?{query}"),
        &headers,
    )? {
        records.extend(parse_anthropic_usage(&page));
    }
    for page in fetch_pages(agent, &format!("{base}/cost_report?{query}"), &headers)? {
        records.extend(parse_anthropic_cost(&page));
    }
    Ok(records)
}

pub fn fetch_openai(agent: &ureq::Agent, key: &str, now: i64) -> Result<Vec<Record>, String> {
    let base = "https://api.openai.com/v1/organization";
    let headers = [("Authorization", format!("Bearer {key}"))];
    let query = format!(
        "start_time={}&bucket_width=1d&limit=31",
        since_day(now).timestamp()
    );
    let mut records = Vec::new();
    for page in fetch_pages(
        agent,
        &format!("{base}/usage/completions?{query}"),
        &headers,
    )? {
        records.extend(parse_openai_usage(&page));
    }
    for page in fetch_pages(agent, &format!("{base}/costs?{query}"), &headers)? {
        records.extend(parse_openai_cost(&page));
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn anthropic_usage_sums_every_token_kind() {
        let records = parse_anthropic_usage(&json!({ "data": [{
            "starting_at": "2026-09-22T00:00:00Z",
            "results": [
                { "uncached_input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 400,
                  "cache_creation": { "ephemeral_1h_input_tokens": 10, "ephemeral_5m_input_tokens": 20 } },
                { "uncached_input_tokens": 1, "output_tokens": 2 }
            ]
        }]}));
        let r = &records[0];
        assert_eq!(
            (r.input, r.output, r.cache_read, r.cache_write),
            (101, 52, 400, 30)
        );
    }

    #[test]
    fn anthropic_cost_is_cents() {
        let records = parse_anthropic_cost(&json!({ "data": [{
            "starting_at": "2026-09-22T00:00:00Z",
            "results": [{ "amount": "1234.5" }, { "amount": "100" }]
        }]}));
        assert!((records[0].usd - 13.345).abs() < 1e-9);
    }

    #[test]
    fn openai_usage_splits_cached_input() {
        let records = parse_openai_usage(&json!({ "data": [{
            "start_time": 1790000000,
            "results": [{ "input_tokens": 1000, "input_cached_tokens": 600, "output_tokens": 70 }]
        }]}));
        let r = &records[0];
        assert_eq!(
            (r.ts, r.input, r.output, r.cache_read),
            (1_790_000_000_000, 400, 70, 600)
        );
    }

    #[test]
    fn openai_cost_is_dollars() {
        let records = parse_openai_cost(&json!({ "data": [{
            "start_time": 1790000000,
            "results": [{ "amount": { "value": 1.25, "currency": "usd" } }, { "amount": { "value": 0.5 } }]
        }]}));
        assert_eq!(records[0].usd, 1.75);
    }
}
