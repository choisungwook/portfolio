'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { formatReset, formatTitle, formatTokens, sectionLines } = require('../src/format');
const { aggregate } = require('../src/tokens');

const NOW = Date.parse('2026-09-23T12:00:00');

test('formatTokens abbreviates', () => {
  assert.strictEqual(formatTokens(999), '999');
  assert.strictEqual(formatTokens(1234), '1.2K');
  assert.strictEqual(formatTokens(123_456_789), '123M');
  assert.strictEqual(formatTokens(2_500_000_000), '2.5B');
});

test('formatReset counts down, then switches to a date', () => {
  assert.strictEqual(formatReset(NOW + 30 * 60000, NOW), 'resets in 30m');
  assert.strictEqual(formatReset(NOW + 130 * 60000, NOW), 'resets in 2h 10m');
  assert.match(formatReset(NOW + 5 * 86400000, NOW), /^resets \d{4}-\d{2}-\d{2}$/);
});

test('title shows the tightest limit, falls back to tokens and skips failures', () => {
  const tokens = aggregate([{ ts: NOW - 1000, input: 1500, output: 0 }], NOW);
  const title = formatTitle([
    { id: 'claude', tokens },
    { id: 'codex', limits: [{ percent: 12 }, { percent: 71.6 }] },
    { id: 'kiro', error: 'not installed' },
    { id: 'openai-org', tokens },
  ]);
  assert.strictEqual(title, 'C 1.5K · X 72%');
  assert.strictEqual(formatTitle([]), 'AI –');
});

test('aggregate splits today, 7 days and 30 days', () => {
  const day = 86400000;
  const totals = aggregate(
    [
      { ts: NOW - 1000, input: 1, output: 0 },
      { ts: NOW - 3 * day, input: 10, output: 0 },
      { ts: NOW - 20 * day, input: 100, output: 0, usd: 2 },
      { ts: NOW - 40 * day, input: 1000, output: 0 },
    ],
    NOW
  );
  assert.deepStrictEqual([totals.today.total, totals.week.total, totals.month.total], [1, 11, 111]);
  assert.strictEqual(totals.month.usd, 2);
});

test('sectionLines renders limits, credits and an error', () => {
  const lines = sectionLines(
    { plan: 'KIRO PRO', credits: { used: 10, limit: 100 }, limits: [{ label: 'month', percent: 10, resetsAt: null }] },
    NOW
  );
  assert.deepStrictEqual(lines, ['Plan: KIRO PRO', 'month: 10%', 'Credits: 10 / 100']);
  assert.deepStrictEqual(sectionLines({ error: 'boom' }, NOW), ['Error: boom']);
});
