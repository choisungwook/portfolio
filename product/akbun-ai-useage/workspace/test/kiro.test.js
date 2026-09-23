'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { parseKiroUsage } = require('../src/kiro');

test('parseKiroUsage reads plan, credits, percent and reset date', () => {
  const usage = parseKiroUsage(
    '\u001b[1mEstimated Usage | resets on 2026-10-01 | KIRO PRO+\u001b[0m\nCredits (1,233.74 of 2000 covered in plan)\n\u001b[32m████ 61%\u001b[0m\n'
  );
  assert.strictEqual(usage.plan, 'KIRO PRO+');
  assert.strictEqual(usage.used, 1233.74);
  assert.strictEqual(usage.limit, 2000);
  assert.strictEqual(usage.percent, 61);
  assert.strictEqual(usage.resetsAt, Date.parse('2026-10-01T00:00:00'));
});

test('parseKiroUsage computes percent when the bar is missing', () => {
  const usage = parseKiroUsage('Credits (10 of 100 covered in plan)');
  assert.strictEqual(usage.percent, 10);
  assert.strictEqual(usage.plan, null);
});

test('parseKiroUsage returns null for unrelated output', () => {
  assert.strictEqual(parseKiroUsage('error: not logged in'), null);
});
