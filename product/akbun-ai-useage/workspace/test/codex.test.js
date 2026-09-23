'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { parseCodexLog, windowLabel } = require('../src/codex');

function tokenCount(ts, total, last, rateLimits) {
  return JSON.stringify({
    timestamp: ts,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { total_tokens: total }, last_token_usage: last },
      rate_limits: rateLimits,
    },
  });
}

test('parseCodexLog splits cached input and drops repeated events', () => {
  const last = { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50, reasoning_output_tokens: 30, total_tokens: 1050 };
  const text = [
    JSON.stringify({ timestamp: '2026-09-23T01:00:00Z', type: 'session_meta', payload: {} }),
    tokenCount('2026-09-23T01:00:01Z', 1050, last),
    tokenCount('2026-09-23T01:00:02Z', 1050, last),
    tokenCount('2026-09-23T01:00:03Z', 2100, last),
  ].join('\n');

  const { records } = parseCodexLog(text);
  assert.strictEqual(records.length, 2);
  assert.deepStrictEqual(
    { input: records[0].input, cacheRead: records[0].cacheRead, output: records[0].output },
    { input: 200, cacheRead: 800, output: 50 }
  );
});

test('parseCodexLog keeps the newest rate limits in both reset formats', () => {
  const text = [
    tokenCount('2026-09-23T01:00:00Z', 1, null, {
      primary: { used_percent: 5, window_minutes: 300, resets_in_seconds: 60 },
    }),
    tokenCount('2026-09-23T02:00:00Z', 2, null, {
      primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1790000000 },
      secondary: { used_percent: 40, window_minutes: 10080, resets_at: 1790500000 },
      plan_type: 'plus',
    }),
  ].join('\n');

  const { limits } = parseCodexLog(text);
  assert.strictEqual(limits.plan, 'plus');
  assert.deepStrictEqual(limits.windows.map((w) => [w.label, w.percent, w.resetsAt]), [
    ['5h', 12.5, 1790000000000],
    ['7d', 40, 1790500000000],
  ]);

  const older = parseCodexLog(text.split('\n')[0]).limits;
  assert.strictEqual(older.windows[0].resetsAt, Date.parse('2026-09-23T01:00:00Z') + 60000);
});

test('windowLabel names common windows', () => {
  assert.strictEqual(windowLabel(300), '5h');
  assert.strictEqual(windowLabel(10080), '7d');
  assert.strictEqual(windowLabel(45), '45m');
});
