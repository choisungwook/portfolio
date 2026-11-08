'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { STYLES, redactRect, blockSize } = require('../src/redact');

test('redactRect sorts a backwards drag and snaps outward to whole pixels', () => {
  const rect = redactRect({ x1: 50.6, y1: 40.2, x2: 10.4, y2: 5.9 }, 200, 100);
  assert.deepStrictEqual(rect, { x: 10, y: 5, width: 41, height: 36 });
});

test('redactRect clips to the image and drops a box entirely outside it', () => {
  assert.deepStrictEqual(redactRect({ x1: -20, y1: 90, x2: 30, y2: 140 }, 200, 100), {
    x: 0,
    y: 90,
    width: 30,
    height: 10,
  });
  assert.strictEqual(redactRect({ x1: 250, y1: 10, x2: 300, y2: 20 }, 200, 100), null);
});

// Small text stays readable under a tiny block, so there is a floor.
test('blockSize follows the display scale with a floor', () => {
  assert.strictEqual(blockSize(1), 12);
  assert.strictEqual(blockSize(2), 24);
  assert.strictEqual(blockSize(0.25), 8);
});

test('the three styles are offered in toolbar order', () => {
  assert.deepStrictEqual(STYLES, ['pixelate', 'blur', 'blackout']);
});
