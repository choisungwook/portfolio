//! Runs every enabled source and returns one section per source.

use crate::scan::ParseCache;
use crate::settings::Settings;
use crate::tokens::{aggregate, DAY_MS};
use crate::{admin, claude, codex, kiro, Limit, Section};
use chrono::{Local, TimeZone};
use std::path::PathBuf;

/// Environment the sources read. Passed in so tests and the app agree on it.
pub struct Env {
    pub home: PathBuf,
    pub claude_config_dir: Option<String>,
    pub claude_oauth_token: Option<String>,
    pub codex_home: Option<String>,
    pub path: Option<String>,
}

impl Env {
    pub fn from_process() -> Self {
        let var = |key: &str| std::env::var(key).ok().filter(|v| !v.is_empty());
        let home = var("HOME")
            .or_else(|| var("USERPROFILE"))
            .unwrap_or_default();
        Self {
            home: PathBuf::from(home),
            claude_config_dir: var("CLAUDE_CONFIG_DIR"),
            claude_oauth_token: var("CLAUDE_CODE_OAUTH_TOKEN"),
            codex_home: var("CODEX_HOME"),
            path: var("PATH"),
        }
    }
}

/// Parse caches live as long as the app, so unchanged logs are read once.
#[derive(Default)]
pub struct Collector {
    claude: ParseCache<Vec<claude::Message>>,
    codex: ParseCache<codex::Parsed>,
}

fn local_midnight(now: i64) -> i64 {
    let today = Local
        .timestamp_millis_opt(now)
        .single()
        .unwrap_or_else(Local::now)
        .date_naive();
    today
        .and_hms_opt(0, 0, 0)
        .and_then(|t| Local.from_local_datetime(&t).earliest())
        .map(|t| t.timestamp_millis())
        .unwrap_or(now - DAY_MS)
}

fn section(id: &'static str, name: &'static str, result: Result<Section, String>) -> Section {
    let mut section = result.unwrap_or_else(|error| Section {
        error: Some(error),
        ..Default::default()
    });
    section.id = id;
    section.name = name;
    section
}

impl Collector {
    pub fn collect(&mut self, settings: &Settings, env: &Env, now: i64) -> Vec<Section> {
        let since = now - 31 * DAY_MS;
        let today = local_midnight(now);
        let agent = crate::http_agent();
        let mut sections = Vec::new();

        if settings.claude.enabled {
            let dirs = claude::claude_dirs(env.claude_config_dir.clone(), &env.home);
            let records = claude::collect_records(&dirs, since, &mut self.claude);
            let mut result = Section {
                tokens: Some(aggregate(&records, now, today)),
                ..Default::default()
            };
            if settings.claude.limits {
                match claude::read_token(env.claude_oauth_token.clone(), &dirs) {
                    None => result.limit_error = Some("no Claude Code login found".into()),
                    Some(token) => match claude::fetch_limits(&agent, &token) {
                        Ok(limits) => result.limits = limits,
                        Err(error) => result.limit_error = Some(error),
                    },
                }
            }
            sections.push(section("claude", "Claude Code", Ok(result)));
        }

        if settings.codex.enabled {
            let home = env
                .codex_home
                .clone()
                .map(PathBuf::from)
                .unwrap_or_else(|| env.home.join(".codex"));
            let result = codex::collect(&home, since, &mut self.codex).map(|parsed| {
                let limits = parsed.limits.unwrap_or(codex::Limits {
                    ts: 0,
                    plan: None,
                    windows: vec![],
                });
                Section {
                    tokens: Some(aggregate(&parsed.records, now, today)),
                    limits: limits.windows,
                    plan: limits.plan,
                    ..Default::default()
                }
            });
            sections.push(section("codex", "Codex", result));
        }

        if settings.kiro.enabled {
            let path = kiro::cli_path(env.path.clone(), &env.home);
            let result = kiro::run_usage(&settings.kiro.command, &path).map(|usage| Section {
                plan: usage.plan,
                credits: Some((usage.used, usage.limit)),
                limits: vec![Limit {
                    label: "month".into(),
                    percent: usage.percent,
                    resets_at: usage
                        .resets_on
                        .and_then(|d| d.and_hms_opt(0, 0, 0))
                        .and_then(|t| Local.from_local_datetime(&t).earliest())
                        .map(|t| t.timestamp_millis()),
                }],
                ..Default::default()
            });
            sections.push(section("kiro", "Kiro", result));
        }

        let key = &settings.anthropic_admin.api_key;
        if !key.is_empty() {
            let result = admin::fetch_anthropic(&agent, key, now).map(|records| Section {
                tokens: Some(aggregate(&records, now, today)),
                ..Default::default()
            });
            sections.push(section("anthropic-org", "Anthropic org", result));
        }

        let key = &settings.openai_admin.api_key;
        if !key.is_empty() {
            let result = admin::fetch_openai(&agent, key, now).map(|records| Section {
                tokens: Some(aggregate(&records, now, today)),
                ..Default::default()
            });
            sections.push(section("openai-org", "OpenAI org", result));
        }

        sections
    }
}
