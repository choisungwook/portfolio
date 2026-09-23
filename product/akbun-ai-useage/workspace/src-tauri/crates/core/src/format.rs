//! Turns sections into the menu bar title and menu lines.

use crate::tokens::Totals;
use crate::Section;

pub fn tokens(n: u64) -> String {
    for (size, suffix) in [(1e9, "B"), (1e6, "M"), (1e3, "K")] {
        let value = n as f64 / size;
        if value >= 1.0 {
            return if value >= 100.0 {
                format!("{value:.0}{suffix}")
            } else {
                format!("{value:.1}{suffix}")
            };
        }
    }
    n.to_string()
}

/// Local wall clock time for the "Updated" line.
pub fn clock(now: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_millis_opt(now)
        .single()
        .map(|t| t.format("%H:%M").to_string())
        .unwrap_or_default()
}

pub fn reset(resets_at: Option<i64>, now: i64) -> String {
    let Some(at) = resets_at else {
        return String::new();
    };
    let minutes = ((at - now) as f64 / 60_000.0).round().max(0.0) as i64;
    if minutes < 60 {
        format!("resets in {minutes}m")
    } else if minutes < 48 * 60 {
        format!("resets in {}h {}m", minutes / 60, minutes % 60)
    } else {
        let date = chrono::DateTime::from_timestamp_millis(at).unwrap_or_default();
        format!("resets {}", date.format("%Y-%m-%d"))
    }
}

fn short_name(id: &str) -> Option<&'static str> {
    match id {
        "claude" => Some("C"),
        "codex" => Some("X"),
        "kiro" => Some("K"),
        _ => None,
    }
}

/// The tightest limit per product, since that is the one about to stop work.
/// Without limits it falls back to today's tokens.
fn title_part(section: &Section) -> Option<String> {
    let short = short_name(section.id)?;
    if section.error.is_some() {
        return None;
    }
    if let Some(worst) = section.limits.iter().map(|l| l.percent).reduce(f64::max) {
        return Some(format!("{short} {}%", worst.round()));
    }
    let today = section.tokens.as_ref()?.today.total();
    Some(format!("{short} {}", tokens(today)))
}

pub fn title(sections: &[Section]) -> String {
    let parts: Vec<_> = sections.iter().filter_map(title_part).collect();
    if parts.is_empty() {
        "AI –".into()
    } else {
        parts.join(" · ")
    }
}

fn totals_line(label: &str, totals: &Totals) -> String {
    let cost = if totals.usd > 0.0 {
        format!(" · ${:.2}", totals.usd)
    } else {
        String::new()
    };
    format!(
        "{label}: {} tokens (in {}, out {}, cache {}){cost}",
        tokens(totals.total()),
        tokens(totals.input),
        tokens(totals.output),
        tokens(totals.cache_read + totals.cache_write)
    )
}

fn number(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{n:.0}")
    } else {
        format!("{n:.2}")
    }
}

pub fn lines(section: &Section, now: i64) -> Vec<String> {
    if let Some(error) = &section.error {
        return vec![format!("Error: {error}")];
    }
    let mut lines = Vec::new();
    if let Some(plan) = &section.plan {
        lines.push(format!("Plan: {plan}"));
    }
    for limit in &section.limits {
        let reset = reset(limit.resets_at, now);
        let suffix = if reset.is_empty() {
            String::new()
        } else {
            format!(" ({reset})")
        };
        lines.push(format!(
            "{}: {}%{suffix}",
            limit.label,
            limit.percent.round()
        ));
    }
    if let Some(error) = &section.limit_error {
        lines.push(format!("Limits: {error}"));
    }
    if let Some((used, limit)) = section.credits {
        lines.push(format!("Credits: {} / {}", number(used), number(limit)));
    }
    if let Some(periods) = &section.tokens {
        lines.push(totals_line("Today", &periods.today));
        lines.push(totals_line("7 days", &periods.week));
        lines.push(totals_line("30 days", &periods.month));
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tokens::Periods;
    use crate::Limit;

    fn limit(percent: f64) -> Limit {
        Limit {
            label: "month".into(),
            percent,
            resets_at: None,
        }
    }

    #[test]
    fn abbreviates_tokens() {
        assert_eq!(tokens(999), "999");
        assert_eq!(tokens(1234), "1.2K");
        assert_eq!(tokens(123_456_789), "123M");
        assert_eq!(tokens(2_500_000_000), "2.5B");
    }

    #[test]
    fn counts_down_then_shows_a_date() {
        let now = 1_790_000_000_000;
        assert_eq!(reset(Some(now + 30 * 60_000), now), "resets in 30m");
        assert_eq!(reset(Some(now + 130 * 60_000), now), "resets in 2h 10m");
        assert!(reset(Some(now + 5 * 86_400_000), now).starts_with("resets 20"));
    }

    #[test]
    fn title_shows_tightest_limit_and_skips_failures() {
        let mut periods = Periods::default();
        periods.today.input = 1500;
        let sections = [
            Section {
                id: "claude",
                tokens: Some(periods.clone()),
                ..Default::default()
            },
            Section {
                id: "codex",
                limits: vec![limit(12.0), limit(71.6)],
                ..Default::default()
            },
            Section {
                id: "kiro",
                error: Some("not installed".into()),
                ..Default::default()
            },
            Section {
                id: "openai-org",
                tokens: Some(periods),
                ..Default::default()
            },
        ];
        assert_eq!(title(&sections), "C 1.5K · X 72%");
        assert_eq!(title(&[]), "AI –");
    }

    #[test]
    fn renders_plan_limits_credits_and_errors() {
        let section = Section {
            plan: Some("KIRO PRO".into()),
            credits: Some((10.0, 100.0)),
            limits: vec![limit(10.0)],
            ..Default::default()
        };
        assert_eq!(
            lines(&section, 0),
            ["Plan: KIRO PRO", "month: 10%", "Credits: 10 / 100"]
        );
        let failed = Section {
            error: Some("boom".into()),
            ..Default::default()
        };
        assert_eq!(lines(&failed, 0), ["Error: boom"]);
    }
}
