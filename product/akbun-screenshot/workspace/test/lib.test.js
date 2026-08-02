'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const {
  buildEditedFilename,
  buildScreenshotFilename,
  editorWindowSize,
  mergeSettings,
  previewPosition,
} = require('../src/lib');

test('buildScreenshotFilename formats local date and time', () => {
  const date = new Date(2026, 6, 31, 14, 25, 30);
  assert.strictEqual(buildScreenshotFilename(date), 'akbun-screenshot-2026-07-31-142530.png');
});

// The stamp goes before the extension, otherwise the save dialog offers a name
// the system does not treat as a png.
test('buildEditedFilename appends a stamp and keeps the extension last', () => {
  const date = new Date(2026, 6, 31, 14, 30, 12);
  assert.strictEqual(
    buildEditedFilename('akbun-screenshot-2026-07-31-142530.png', date),
    'akbun-screenshot-2026-07-31-142530-edited-20260731143012.png'
  );
});

test('buildEditedFilename handles a name with no extension', () => {
  const date = new Date(2026, 6, 31, 14, 30, 12);
  assert.strictEqual(buildEditedFilename('shot', date), 'shot-edited-20260731143012');
  // A leading dot names a hidden file, it is not an extension to insert before.
  assert.strictEqual(buildEditedFilename('.shot', date), '.shot-edited-20260731143012');
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

// The settings file grew a boolean. Keeping only strings would have dropped it
// on every load, so the toggle would never stay off.
test('mergeSettings carries a stored boolean and rejects a mistyped one', () => {
  const defaults = { deleteKeys: true, shortcut: 'A' };
  assert.strictEqual(mergeSettings(defaults, { deleteKeys: false }).deleteKeys, false);
  assert.strictEqual(mergeSettings(defaults, { deleteKeys: 'false' }).deleteKeys, true);
  assert.strictEqual(mergeSettings(defaults, {}).deleteKeys, true);
});

// A retina png is twice the points it was selected in, so without the divide a
// half-screen selection opens a window wider than the screen.
// The image is wide enough that the divided width clears the toolbar minimum,
// so the assertion is about the scale factor rather than about the clamp.
test('editorWindowSize follows the display scale factor', () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const size = editorWindowSize({ width: 2400, height: 1000 }, workArea, 2);
  assert.deepStrictEqual(size, { width: 1232, height: 592 });
});

test('editorWindowSize keeps room for the toolbar and stays inside the work area', () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  assert.deepStrictEqual(editorWindowSize({ width: 120, height: 80 }, workArea), {
    width: 860,
    height: 172,
  });
  assert.deepStrictEqual(editorWindowSize({ width: 4000, height: 3000 }, workArea), {
    width: 1440,
    height: 900,
  });
});

test('previewPosition stacks windows upward from the bottom-left corner', () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const size = { width: 280, height: 200 };
  const first = previewPosition(workArea, size, 0);
  const second = previewPosition(workArea, size, 1);
  assert.deepStrictEqual(first, { x: 20, y: 680 });
  assert.deepStrictEqual(second, { x: 20, y: 468 });
});
