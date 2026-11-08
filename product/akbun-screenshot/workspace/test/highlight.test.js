'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { WIDTH_FACTOR } = require('../src/highlight');
const { bounds, hitTest } = require('../src/shapes');

test('a marker is several pen widths wide', () => {
  assert.strictEqual(WIDTH_FACTOR, 6);
});

// The marker is wide, so its box has to reach past the centre line.
test('a highlight box includes half its width on every side', () => {
  const shape = { type: 'highlight', width: 12, points: [{ x: 10, y: 20 }, { x: 50, y: 20 }] };
  assert.deepStrictEqual(bounds(shape), { x1: 4, y1: 14, x2: 56, y2: 26 });
});

test('a click on the edge of a wide highlight selects it', () => {
  const shape = { type: 'highlight', width: 12, points: [{ x: 10, y: 20 }, { x: 50, y: 20 }] };
  assert.strictEqual(hitTest([shape], 30, 25), shape);
});

test('a pencil box stays on its centre line', () => {
  const shape = { type: 'pencil', width: 12, points: [{ x: 10, y: 20 }, { x: 50, y: 20 }] };
  assert.deepStrictEqual(bounds(shape), { x1: 10, y1: 20, x2: 50, y2: 20 });
});
