//! Which days have to go to the API. See adr/2026-09-settle-days-cache.md.

use chrono::{Duration, NaiveDate};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DateRange {
  pub start: NaiveDate,
  pub end: NaiveDate,
}

impl DateRange {
  pub fn days(&self) -> Vec<NaiveDate> {
    let mut out = Vec::new();
    let mut day = self.start;
    while day <= self.end {
      out.push(day);
      day += Duration::days(1);
    }
    out
  }
}

/// Days in `start..=end` that must be fetched, oldest first.
///
/// A day is fetched when it is newer than `today - settle_days`, because
/// AdSense keeps adjusting recent numbers, or when it has never been fetched
/// for this kind. Days after `today` are skipped: there is nothing to fetch.
pub fn missing_days(
  start: NaiveDate,
  end: NaiveDate,
  today: NaiveDate,
  settle_days: i64,
  fetched: &HashSet<NaiveDate>,
) -> Vec<NaiveDate> {
  let settled_before = today - Duration::days(settle_days);
  let last = end.min(today);
  DateRange { start, end: last }
    .days()
    .into_iter()
    .filter(|day| *day > settled_before || !fetched.contains(day))
    .collect()
}

/// Collapse sorted days into contiguous ranges so one API call covers each.
pub fn group_ranges(days: &[NaiveDate]) -> Vec<DateRange> {
  let mut ranges: Vec<DateRange> = Vec::new();
  for &day in days {
    match ranges.last_mut() {
      Some(range) if range.end + Duration::days(1) == day => range.end = day,
      _ => ranges.push(DateRange { start: day, end: day }),
    }
  }
  ranges
}

#[cfg(test)]
mod tests {
  use super::*;

  fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
  }

  #[test]
  fn settled_and_fetched_days_are_skipped() {
    let fetched: HashSet<_> = [d("2026-08-01"), d("2026-08-02")].into_iter().collect();
    let days = missing_days(d("2026-08-01"), d("2026-08-03"), d("2026-09-01"), 7, &fetched);
    assert_eq!(days, vec![d("2026-08-03")]);
  }

  #[test]
  fn days_inside_settle_window_are_always_refetched() {
    let fetched: HashSet<_> = [d("2026-08-30"), d("2026-08-31")].into_iter().collect();
    let days = missing_days(d("2026-08-24"), d("2026-08-31"), d("2026-08-31"), 7, &fetched);
    // 2026-08-24 is exactly today - 7 and counts as settled.
    assert_eq!(days.first(), Some(&d("2026-08-24")));
    assert!(days.contains(&d("2026-08-30")));
    assert!(days.contains(&d("2026-08-31")));
    assert_eq!(days.len(), 8);
  }

  #[test]
  fn settled_boundary_day_is_cached() {
    let fetched: HashSet<_> = [d("2026-08-24")].into_iter().collect();
    let days = missing_days(d("2026-08-24"), d("2026-08-24"), d("2026-08-31"), 7, &fetched);
    assert!(days.is_empty());
  }

  #[test]
  fn future_days_are_not_fetched() {
    let fetched = HashSet::new();
    let days = missing_days(d("2026-09-01"), d("2026-09-10"), d("2026-09-03"), 7, &fetched);
    assert_eq!(days, DateRange { start: d("2026-09-01"), end: d("2026-09-03") }.days());
  }

  #[test]
  fn ranges_merge_consecutive_days_only() {
    let days = vec![d("2026-08-01"), d("2026-08-02"), d("2026-08-04"), d("2026-08-10"), d("2026-08-11")];
    assert_eq!(
      group_ranges(&days),
      vec![
        DateRange { start: d("2026-08-01"), end: d("2026-08-02") },
        DateRange { start: d("2026-08-04"), end: d("2026-08-04") },
        DateRange { start: d("2026-08-10"), end: d("2026-08-11") },
      ]
    );
  }

  #[test]
  fn ranges_of_nothing_is_nothing() {
    assert!(group_ranges(&[]).is_empty());
  }
}
