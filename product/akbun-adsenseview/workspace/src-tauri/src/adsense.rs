//! AdSense Management API v2: the first account, and one report call per
//! contiguous date range.

use crate::error::{AppError, ErrorKind};
use adsense_cache::{DailyRow, DateRange, Kind};
use chrono::Datelike;
use serde::Deserialize;

const API: &str = "https://adsense.googleapis.com/v2";
const METRICS: [&str; 4] = ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "CLICKS", "IMPRESSIONS"];

#[derive(Deserialize)]
struct AccountList {
  #[serde(default)]
  accounts: Vec<Account>,
}

#[derive(Deserialize)]
struct Account {
  name: String,
}

#[derive(Deserialize)]
struct Header {
  name: String,
  #[serde(rename = "currencyCode")]
  currency_code: Option<String>,
}

#[derive(Deserialize)]
struct Cell {
  #[serde(default)]
  value: String,
}

#[derive(Deserialize)]
struct Row {
  cells: Vec<Cell>,
}

#[derive(Deserialize)]
struct ReportResponse {
  headers: Vec<Header>,
  #[serde(default)]
  rows: Vec<Row>,
}

pub struct Report {
  pub rows: Vec<DailyRow>,
  pub currency: Option<String>,
}

async fn check(response: reqwest::Response) -> Result<reqwest::Response, AppError> {
  let status = response.status();
  if status.is_success() {
    return Ok(response);
  }
  let text = response.text().await.unwrap_or_default();
  let kind = match status.as_u16() {
    401 => ErrorKind::Auth,
    429 => ErrorKind::Quota,
    403 if text.contains("quota") || text.contains("RESOURCE_EXHAUSTED") => ErrorKind::Quota,
    _ => ErrorKind::Other,
  };
  Err(AppError::new(kind, format!("adsense {status}: {text}")))
}

pub async fn first_account(http: &reqwest::Client, token: &str) -> Result<String, AppError> {
  let response = http
    .get(format!("{API}/accounts"))
    .bearer_auth(token)
    .send()
    .await?;
  let list: AccountList = check(response).await?.json().await?;
  list
    .accounts
    .into_iter()
    .next()
    .map(|account| account.name)
    .ok_or_else(|| AppError::other("this Google account has no AdSense account"))
}

pub async fn report(
  http: &reqwest::Client,
  token: &str,
  account: &str,
  kind: Kind,
  range: DateRange,
) -> Result<Report, AppError> {
  let mut query: Vec<(&str, String)> = vec![
    ("dateRange", "CUSTOM".into()),
    ("startDate.year", range.start.year().to_string()),
    ("startDate.month", range.start.month().to_string()),
    ("startDate.day", range.start.day().to_string()),
    ("endDate.year", range.end.year().to_string()),
    ("endDate.month", range.end.month().to_string()),
    ("endDate.day", range.end.day().to_string()),
    ("dimensions", "DATE".into()),
    ("dimensions", kind.dimension().into()),
    ("limit", "100000".into()),
  ];
  for metric in METRICS {
    query.push(("metrics", metric.into()));
  }
  let response = http
    .get(format!("{API}/{account}/reports:generate"))
    .bearer_auth(token)
    .query(&query)
    .send()
    .await?;
  let body: ReportResponse = check(response).await?.json().await?;
  parse_report(body, kind)
}

fn parse_report(body: ReportResponse, kind: Kind) -> Result<Report, AppError> {
  let column = |name: &str| {
    body
      .headers
      .iter()
      .position(|header| header.name == name)
      .ok_or_else(|| AppError::other(format!("report has no {name} column")))
  };
  let date = column("DATE")?;
  let name = column(kind.dimension())?;
  let earnings = column("ESTIMATED_EARNINGS")?;
  let page_views = column("PAGE_VIEWS")?;
  let clicks = column("CLICKS")?;
  let impressions = column("IMPRESSIONS")?;
  let currency = body.headers[earnings].currency_code.clone();

  let rows = body
    .rows
    .iter()
    .map(|row| {
      let cell = |index: usize| row.cells.get(index).map(|c| c.value.as_str()).unwrap_or("");
      DailyRow {
        day: cell(date).to_string(),
        name: cell(name).to_string(),
        earnings: cell(earnings).parse().unwrap_or(0.0),
        page_views: cell(page_views).parse().unwrap_or(0),
        clicks: cell(clicks).parse().unwrap_or(0),
        impressions: cell(impressions).parse().unwrap_or(0),
      }
    })
    .collect();
  Ok(Report { rows, currency })
}
