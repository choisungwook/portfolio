'use strict';

// One usage record is one billed call or one daily bucket:
// { ts, input, output, cacheRead, cacheWrite }. input excludes cached input,
// so the four fields add up to what the provider counted.

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, usd: 0 };
}

function addRecord(totals, record) {
  totals.input += record.input || 0;
  totals.output += record.output || 0;
  totals.cacheRead += record.cacheRead || 0;
  totals.cacheWrite += record.cacheWrite || 0;
  totals.usd += record.usd || 0;
  totals.total = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
}

// "Today" starts at local midnight; 7 and 30 days are rolling windows.
function periodStarts(now) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return { today: midnight.getTime(), week: now - 7 * DAY_MS, month: now - 30 * DAY_MS };
}

function aggregate(records, now = Date.now()) {
  const starts = periodStarts(now);
  const result = { today: emptyTotals(), week: emptyTotals(), month: emptyTotals() };
  for (const record of records) {
    for (const period of Object.keys(starts)) {
      if (record.ts >= starts[period] && record.ts <= now) addRecord(result[period], record);
    }
  }
  return result;
}

module.exports = { DAY_MS, aggregate, emptyTotals, periodStarts };
