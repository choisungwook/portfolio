//! SQLite tables `daily` and `fetched`.
//!
//! `daily` holds one row per day, kind and name. `fetched` records that a day
//! was asked of the API for a kind, even when the answer had no rows; without
//! it an empty day would be refetched forever.

use crate::{DateRange, Kind};
use chrono::NaiveDate;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DailyRow {
  pub day: String,
  pub name: String,
  pub earnings: f64,
  pub page_views: i64,
  pub clicks: i64,
  pub impressions: i64,
}

pub struct Store {
  conn: Connection,
}

const SCHEMA: &str = "
  CREATE TABLE IF NOT EXISTS daily (
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    earnings REAL NOT NULL,
    page_views INTEGER NOT NULL,
    clicks INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    PRIMARY KEY (day, kind, name)
  );
  CREATE TABLE IF NOT EXISTS fetched (
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    PRIMARY KEY (day, kind)
  );
";

fn iso(day: NaiveDate) -> String {
  day.format("%Y-%m-%d").to_string()
}

impl Store {
  pub fn open(path: &Path) -> rusqlite::Result<Store> {
    Self::from_connection(Connection::open(path)?)
  }

  pub fn in_memory() -> rusqlite::Result<Store> {
    Self::from_connection(Connection::open_in_memory()?)
  }

  fn from_connection(conn: Connection) -> rusqlite::Result<Store> {
    conn.execute_batch(SCHEMA)?;
    Ok(Store { conn })
  }

  /// Days in `range` already asked of the API for this kind.
  pub fn fetched_days(&self, kind: Kind, range: DateRange) -> rusqlite::Result<HashSet<NaiveDate>> {
    let mut stmt = self
      .conn
      .prepare("SELECT day FROM fetched WHERE kind = ?1 AND day BETWEEN ?2 AND ?3")?;
    let days = stmt
      .query_map(params![kind.as_str(), iso(range.start), iso(range.end)], |row| {
        row.get::<_, String>(0)
      })?
      .filter_map(|day| day.ok())
      .filter_map(|day| NaiveDate::parse_from_str(&day, "%Y-%m-%d").ok())
      .collect();
    Ok(days)
  }

  /// Replace every row of `range` for this kind with `rows` and mark the
  /// whole range fetched. Old rows are deleted first, so a name that
  /// disappeared from the API answer disappears here too.
  pub fn upsert_range(&mut self, kind: Kind, range: DateRange, rows: &[DailyRow]) -> rusqlite::Result<()> {
    let tx = self.conn.transaction()?;
    let (start, end) = (iso(range.start), iso(range.end));
    tx.execute(
      "DELETE FROM daily WHERE kind = ?1 AND day BETWEEN ?2 AND ?3",
      params![kind.as_str(), start, end],
    )?;
    {
      let mut insert = tx.prepare(
        "INSERT OR REPLACE INTO daily (day, kind, name, earnings, page_views, clicks, impressions)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      )?;
      for row in rows {
        insert.execute(params![
          row.day,
          kind.as_str(),
          row.name,
          row.earnings,
          row.page_views,
          row.clicks,
          row.impressions
        ])?;
      }
      let mut mark = tx.prepare("INSERT OR IGNORE INTO fetched (day, kind) VALUES (?1, ?2)")?;
      for day in range.days() {
        mark.execute(params![iso(day), kind.as_str()])?;
      }
    }
    tx.commit()
  }

  pub fn read(&self, kind: Kind, range: DateRange) -> rusqlite::Result<Vec<DailyRow>> {
    let mut stmt = self.conn.prepare(
      "SELECT day, name, earnings, page_views, clicks, impressions FROM daily
       WHERE kind = ?1 AND day BETWEEN ?2 AND ?3 ORDER BY day, name",
    )?;
    let rows = stmt
      .query_map(params![kind.as_str(), iso(range.start), iso(range.end)], |row| {
        Ok(DailyRow {
          day: row.get(0)?,
          name: row.get(1)?,
          earnings: row.get(2)?,
          page_views: row.get(3)?,
          clicks: row.get(4)?,
          impressions: row.get(5)?,
        })
      })?
      .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
  }

  pub fn clear(&mut self) -> rusqlite::Result<()> {
    self.conn.execute_batch("DELETE FROM daily; DELETE FROM fetched;")
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
  }

  fn row(day: &str, name: &str, earnings: f64) -> DailyRow {
    DailyRow {
      day: day.to_string(),
      name: name.to_string(),
      earnings,
      page_views: 10,
      clicks: 1,
      impressions: 20,
    }
  }

  #[test]
  fn upsert_then_read_round_trips() {
    let mut store = Store::in_memory().unwrap();
    let range = DateRange { start: d("2026-08-01"), end: d("2026-08-02") };
    let rows = vec![row("2026-08-01", "a.com", 1.5), row("2026-08-02", "a.com", 2.0)];
    store.upsert_range(Kind::Site, range, &rows).unwrap();
    assert_eq!(store.read(Kind::Site, range).unwrap(), rows);
  }

  #[test]
  fn upsert_overwrites_and_drops_vanished_names() {
    let mut store = Store::in_memory().unwrap();
    let range = DateRange { start: d("2026-08-01"), end: d("2026-08-01") };
    store
      .upsert_range(Kind::Site, range, &[row("2026-08-01", "a.com", 1.0), row("2026-08-01", "b.com", 1.0)])
      .unwrap();
    store.upsert_range(Kind::Site, range, &[row("2026-08-01", "a.com", 3.0)]).unwrap();
    assert_eq!(store.read(Kind::Site, range).unwrap(), vec![row("2026-08-01", "a.com", 3.0)]);
  }

  #[test]
  fn empty_answer_still_marks_days_fetched() {
    let mut store = Store::in_memory().unwrap();
    let range = DateRange { start: d("2026-08-01"), end: d("2026-08-03") };
    store.upsert_range(Kind::Page, range, &[]).unwrap();
    let fetched = store.fetched_days(Kind::Page, range).unwrap();
    assert_eq!(fetched.len(), 3);
    assert!(store.fetched_days(Kind::Site, range).unwrap().is_empty());
  }

  #[test]
  fn kinds_do_not_share_rows() {
    let mut store = Store::in_memory().unwrap();
    let range = DateRange { start: d("2026-08-01"), end: d("2026-08-01") };
    store.upsert_range(Kind::Site, range, &[row("2026-08-01", "a.com", 1.0)]).unwrap();
    assert!(store.read(Kind::Channel, range).unwrap().is_empty());
  }

  #[test]
  fn clear_forgets_rows_and_fetched_days() {
    let mut store = Store::in_memory().unwrap();
    let range = DateRange { start: d("2026-08-01"), end: d("2026-08-01") };
    store.upsert_range(Kind::Site, range, &[row("2026-08-01", "a.com", 1.0)]).unwrap();
    store.clear().unwrap();
    assert!(store.read(Kind::Site, range).unwrap().is_empty());
    assert!(store.fetched_days(Kind::Site, range).unwrap().is_empty());
  }
}
