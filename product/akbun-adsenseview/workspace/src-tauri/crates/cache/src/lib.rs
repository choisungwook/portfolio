//! The part of the app that decides what to ask the API for and remembers the
//! answer. Everything here is pure enough to unit test without a window.

pub mod plan;
pub mod store;

pub use plan::{group_ranges, missing_days, DateRange};
pub use store::{DailyRow, Store};

use serde::{Deserialize, Serialize};

/// Which AdSense dimension a report is grouped by. Each kind is cached on its
/// own, so a site report never marks a page report as fetched.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
  Site,
  Page,
  Channel,
}

impl Kind {
  /// The value stored in the `kind` column.
  pub fn as_str(self) -> &'static str {
    match self {
      Kind::Site => "site",
      Kind::Page => "page",
      Kind::Channel => "channel",
    }
  }

  /// The AdSense report dimension that goes next to DATE.
  pub fn dimension(self) -> &'static str {
    match self {
      Kind::Site => "OWNED_SITE_DOMAIN_NAME",
      Kind::Page => "PAGE_URL",
      Kind::Channel => "URL_CHANNEL_NAME",
    }
  }
}
