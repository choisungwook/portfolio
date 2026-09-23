//! Everything the app shows, with no tauri dependency: the usage sources,
//! aggregation and the menu text.

pub mod admin;
pub mod claude;
pub mod codex;
pub mod collect;
pub mod format;
pub mod kiro;
pub mod scan;
pub mod settings;
pub mod tokens;

/// One subscription window, such as Claude's 5 hour limit or Kiro's month.
#[derive(Debug, Clone, PartialEq)]
pub struct Limit {
    pub label: String,
    pub percent: f64,
    pub resets_at: Option<i64>,
}

/// One menu block per source. A failing source keeps its block with `error`,
/// so one broken login does not hide the others.
#[derive(Debug, Clone, Default)]
pub struct Section {
    pub id: &'static str,
    pub name: &'static str,
    pub error: Option<String>,
    pub plan: Option<String>,
    pub limits: Vec<Limit>,
    pub limit_error: Option<String>,
    pub credits: Option<(f64, f64)>,
    pub tokens: Option<tokens::Periods>,
}

pub fn http_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(20)))
        .build()
        .into()
}
