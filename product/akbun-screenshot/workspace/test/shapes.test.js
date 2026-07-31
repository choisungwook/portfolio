'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { constrain, nextNumber } = require('../src/renderer/shapes');

test('constrain turns a lopsided ellipse drag into a circle', () => {
  const end = constrain('ellipse', 100, 100, 180, 130);
  assert.deepStrictEqual(end, { x: 180, y: 180 });
});

test('constrain keeps the drag direction when squaring', () => {
  assert.deepStrictEqual(constrain('rect', 100, 100, 20, 70), { x: 20, y: 20 });
});

test('constrain snaps a line to the nearest 45 degree step', () => {
  const flat = constrain('line', 0, 0, 100, 12);
  assert.strictEqual(Math.round(flat.x), 101);
  assert.strictEqual(Math.round(flat.y), 0);

  const diagonal = constrain('line', 0, 0, 100, 90);
  assert.strictEqual(Math.round(diagonal.x), Math.round(diagonal.y));
});

// Undo pops the last shape, so counting badges is what renumbers the next one.
test('nextNumber follows the badges currently in the document', () => {
  const shapes = [{ type: 'rect' }, { type: 'number' }, { type: 'number' }];
  assert.strictEqual(nextNumber(shapes), 3);
  shapes.pop();
  assert.strictEqual(nextNumber(shapes), 2);
  assert.strictEqual(nextNumber([]), 1);
});
