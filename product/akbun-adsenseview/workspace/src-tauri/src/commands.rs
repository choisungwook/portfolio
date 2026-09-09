//! The command surface the page calls. The page never talks to Google or the
//! cache directly; every rule about what to fetch lives on this side.

use crate::error::{AppError, ErrorKind};
use crate::settings::{self, Settings};
use crate::{adsense, auth};
use adsense_cache::{group_ranges, missing_days, DailyRow, DateRange, Kind, Store};
use chrono::{Local, NaiveDate};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
  pub dir: PathBuf,
  pub http: reqwest::Client,
  pub store: Mutex<Store>,
  pub settings: Mutex<Settings>,
  pub account: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
  pub signed_in: bool,
  pub has_client_secret: bool,
  pub config_dir: String,
  pub settle_days: i64,
  pub currency: Option<String>,
  pub version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportResult {
  pub rows: Vec<DailyRow>,
  pub api_days: usize,
  pub cache_days: usize,
  pub currency: Option<String>,
}

fn status(app: &AppHandle, state: &AppState) -> Status {
  let settings = state.settings.lock().unwrap();
  Status {
    signed_in: auth::load_token(&state.dir).is_some(),
    has_client_secret: auth::has_client_secret(&state.dir),
    config_dir: state.dir.display().to_string(),
    settle_days: settings.settle_days,
    currency: settings.currency.clone(),
    version: app.package_info().version.to_string(),
  }
}

#[tauri::command]
pub fn get_status(app: AppHandle, state: State<AppState>) -> Status {
  status(&app, &state)
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, state: State<'_, AppState>) -> Result<Status, AppError> {
  let client = auth::load_client_secret(&state.dir)?;
  let (url, listener, expected_state) = auth::start_sign_in(&client)?;
  app
    .opener()
    .open_url(&url, None::<&str>)
    .map_err(|error| AppError::other(format!("cannot open browser: {error}")))?;
  let (code, redirect) = tauri::async_runtime::spawn_blocking(move || auth::wait_for_code(listener, &expected_state))
    .await
    .map_err(|error| AppError::other(error.to_string()))??;
  auth::exchange_code(&state.http, &state.dir, &client, &code, &redirect).await?;
  *state.account.lock().unwrap() = None;
  Ok(status(&app, &state))
}

#[tauri::command]
pub fn sign_out(app: AppHandle, state: State<AppState>) -> Status {
  auth::sign_out(&state.dir);
  *state.account.lock().unwrap() = None;
  status(&app, &state)
}

fn parse_day(text: &str) -> Result<NaiveDate, AppError> {
  NaiveDate::parse_from_str(text, "%Y-%m-%d").map_err(|_| AppError::other(format!("bad date {text}")))
}

async fn account(state: &AppState, token: &str) -> Result<String, AppError> {
  if let Some(account) = state.account.lock().unwrap().clone() {
    return Ok(account);
  }
  let account = adsense::first_account(&state.http, token).await?;
  *state.account.lock().unwrap() = Some(account.clone());
  Ok(account)
}

/// Serve `start..=end` for `kind`, going to the API only for days the cache
/// rules say are missing or not yet settled.
#[tauri::command]
pub async fn load_report(
  state: State<'_, AppState>,
  kind: Kind,
  start: String,
  end: String,
) -> Result<ReportResult, AppError> {
  let range = DateRange { start: parse_day(&start)?, end: parse_day(&end)? };
  if range.start > range.end {
    return Err(AppError::other("start is after end"));
  }
  let today = Local::now().date_naive();
  let settle_days = state.settings.lock().unwrap().settle_days;
  let fetched = state.store.lock().unwrap().fetched_days(kind, range)?;
  let days = missing_days(range.start, range.end, today, settle_days, &fetched);
  let asked = DateRange { start: range.start, end: range.end.min(today) };
  let asked_days = if asked.start <= asked.end { asked.days().len() } else { 0 };

  if !days.is_empty() {
    let token = auth::access_token(&state.http, &state.dir).await?;
    let account = account(&state, &token).await?;
    for chunk in group_ranges(&days) {
      let report = adsense::report(&state.http, &token, &account, kind, chunk).await?;
      state.store.lock().unwrap().upsert_range(kind, chunk, &report.rows)?;
      if let Some(currency) = report.currency {
        let mut settings = state.settings.lock().unwrap();
        if settings.currency.as_deref() != Some(&currency) {
          settings.currency = Some(currency);
          settings::save(&state.dir, &settings).map_err(AppError::other)?;
        }
      }
    }
  }

  let rows = state.store.lock().unwrap().read(kind, range)?;
  Ok(ReportResult {
    rows,
    api_days: days.len(),
    cache_days: asked_days.saturating_sub(days.len()),
    currency: state.settings.lock().unwrap().currency.clone(),
  })
}

#[tauri::command]
pub fn clear_cache(state: State<AppState>) -> Result<(), AppError> {
  state.store.lock().unwrap().clear()?;
  Ok(())
}

#[tauri::command]
pub fn save_settle_days(app: AppHandle, state: State<AppState>, days: i64) -> Result<Status, AppError> {
  if !(0..=90).contains(&days) {
    return Err(AppError::new(ErrorKind::Other, "settle days must be between 0 and 90"));
  }
  {
    let mut settings = state.settings.lock().unwrap();
    settings.settle_days = days;
    settings::save(&state.dir, &settings).map_err(AppError::other)?;
  }
  Ok(status(&app, &state))
}

#[tauri::command]
pub fn open_config_dir(app: AppHandle, state: State<AppState>) -> Result<(), AppError> {
  app
    .opener()
    .open_path(state.dir.display().to_string(), None::<&str>)
    .map_err(|error| AppError::other(error.to_string()))
}
