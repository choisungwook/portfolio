//! One usage record is one billed call or one daily bucket. `input` excludes
//! cached input, so the four token fields add up to what the provider counted.

pub const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Record {
    pub ts: i64,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub usd: f64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Totals {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub usd: f64,
}

impl Totals {
    pub fn total(&self) -> u64 {
        self.input + self.output + self.cache_read + self.cache_write
    }

    fn add(&mut self, record: &Record) {
        self.input += record.input;
        self.output += record.output;
        self.cache_read += record.cache_read;
        self.cache_write += record.cache_write;
        self.usd += record.usd;
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Periods {
    pub today: Totals,
    pub week: Totals,
    pub month: Totals,
}

/// "Today" starts at `today_start` (local midnight, from the caller); 7 and 30
/// days are rolling windows.
pub fn aggregate(records: &[Record], now: i64, today_start: i64) -> Periods {
    let mut periods = Periods::default();
    for record in records.iter().filter(|r| r.ts <= now) {
        if record.ts >= today_start {
            periods.today.add(record);
        }
        if record.ts >= now - 7 * DAY_MS {
            periods.week.add(record);
        }
        if record.ts >= now - 30 * DAY_MS {
            periods.month.add(record);
        }
    }
    periods
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(ts: i64, input: u64, usd: f64) -> Record {
        Record {
            ts,
            input,
            usd,
            ..Default::default()
        }
    }

    #[test]
    fn splits_today_week_and_month() {
        let now = 100 * DAY_MS;
        let today_start = now - DAY_MS / 2;
        let periods = aggregate(
            &[
                at(now - 1000, 1, 0.0),
                at(now - 3 * DAY_MS, 10, 0.0),
                at(now - 20 * DAY_MS, 100, 2.0),
                at(now - 40 * DAY_MS, 1000, 0.0),
                at(now + 1000, 5, 0.0),
            ],
            now,
            today_start,
        );
        assert_eq!(
            (
                periods.today.total(),
                periods.week.total(),
                periods.month.total()
            ),
            (1, 11, 111)
        );
        assert_eq!(periods.month.usd, 2.0);
    }
}
