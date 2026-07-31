'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { buildScreenshotFilename, mergeSettings, previewPosition } = require('../src/lib');

test('buildScreenshotFilename formats local date and time', () => {
  const date = new Date(2026, 6, 31, 14, 25, 30);
  assert.strictEqual(buildScreenshotFilename(date), 'akbun-screenshot-2026-07-31-142530.png');
});

test('mergeSettings keeps defaults when stored is missing or partial', () => {
  const defaults = { shortcut: 'A', saveDir: '/d' };
  assert.deepStrictEqual(mergeSettings(defaults, null), defaults);
  assert.deepStrictEqual(mergeSettings(defaults, { shortcut: 'B' }), { shortcut: 'B', saveDir: '/d' });
});

test('mergeSettings drops unknown keys and empty values', () => {
  const defaults = { shortcut: 'A', saveDir: '/d' };
  const merged = mergeSettings(defaults, { shortcut: '', junk: 'x' });
  assert.deepStrictEqual(merged, defaults);
});

test('previewPosition stacks windows upward from the bottom-left corner', () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const size = { width: 280, height: 200 };
  const first = previewPosition(workArea, size, 0);
  const second = previewPosition(workArea, size, 1);
  assert.deepStrictEqual(first, { x: 20, y: 680 });
  assert.deepStrictEqual(second, { x: 20, y: 468 });
});
