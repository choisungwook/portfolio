'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const {
  constrain,
  nextNumber,
  bounds,
  hitTest,
  moveShape,
  scaleShape,
} = require('../src/renderer/shapes');

test('constrain turns a lopsided ellipse drag into a circle', () => {
  const end = constrain('ellipse', 100, 100, 180, 130);
  assert.deepStrictEqual(end, { x: 180, y: 180 });
});

test('constrain keeps the drag direction when squaring', () => {
  assert.deepStrictEqual(constrain('rect', 100, 100, 20, 70), { x: 20, y: 20 });
});

// A drag straight down or straight across leaves one delta at exactly 0, where
// Math.sign is 0 too. Squaring through it used to collapse the circle to a line.
// The still axis has no direction to follow, so it grows positive.
test('constrain squares a drag that moves along one axis only', () => {
  assert.deepStrictEqual(constrain('ellipse', 100, 100, 100, 200), { x: 200, y: 200 });
  assert.deepStrictEqual(constrain('ellipse', 100, 100, 100, 40), { x: 160, y: 40 });
  assert.deepStrictEqual(constrain('rect', 100, 100, 220, 100), { x: 220, y: 220 });
  assert.deepStrictEqual(constrain('rect', 100, 100, 30, 100), { x: 30, y: 170 });
});

test('constrain snaps a line to the nearest 45 degree step', () => {
  const flat = constrain('line', 0, 0, 100, 12);
  assert.strictEqual(Math.round(flat.x), 101);
  assert.strictEqual(Math.round(flat.y), 0);

  const diagonal = constrain('line', 0, 0, 100, 90);
  assert.strictEqual(Math.round(diagonal.x), Math.round(diagonal.y));
});

// Arrows are a line with heads, so Shift has to snap them like a line rather
// than square them like a rectangle.
test('constrain snaps both arrow kinds to 45 degrees', () => {
  for (const type of ['arrow', 'arrow2']) {
    const end = constrain(type, 0, 0, 100, 12);
    assert.strictEqual(Math.round(end.y), 0, type);
  }
});

test('hitTest picks the topmost shape under the point', () => {
  const under = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100 };
  const over = { type: 'rect', x1: 50, y1: 50, x2: 150, y2: 150 };
  assert.strictEqual(hitTest([under, over], 60, 60), over);
  assert.strictEqual(hitTest([under, over], 10, 10), under);
  assert.strictEqual(hitTest([under, over], 400, 400), null);
});

// A drag that ran right to left leaves x2 below x1, and a box built without
// sorting the corners would then never match.
test('hitTest handles a shape dragged backwards', () => {
  const shape = { type: 'line', x1: 200, y1: 200, x2: 100, y2: 100 };
  assert.strictEqual(hitTest([shape], 150, 150), shape);
});

test('hitTest pad reaches just outside the shape', () => {
  const shape = { type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.strictEqual(hitTest([shape], 14, 5, 6), shape);
  assert.strictEqual(hitTest([shape], 20, 5, 6), null);
});

test('moveShape shifts a badge that has no second corner', () => {
  const badge = { type: 'number', x1: 10, y1: 20, size: 20 };
  moveShape(badge, 5, -5);
  assert.strictEqual(badge.x1, 15);
  assert.strictEqual(badge.y1, 15);
  assert.strictEqual(badge.x2, undefined);
  // The box follows the anchor, so a moved badge is still where the click lands.
  assert.deepStrictEqual(bounds(badge), { x1: -1, y1: -1, x2: 31, y2: 31 });
});

test('moveShape shifts both corners of a rectangle', () => {
  const rect = { type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 };
  moveShape(rect, 3, 4);
  assert.deepStrictEqual(rect, { type: 'rect', x1: 3, y1: 4, x2: 13, y2: 14 });
});

// Scaling about a corner would walk the shape across the image on every tap.
test('scaleShape keeps the shape centred where it was', () => {
  const rect = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100, size: 24, width: 4 };
  scaleShape(rect, 0.5);
  assert.deepStrictEqual(
    { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
    { x1: 25, y1: 25, x2: 75, y2: 75 }
  );
  assert.strictEqual(rect.width, 2);
});

test('scaleShape floors size and stroke so a shape cannot vanish', () => {
  const text = { type: 'text', x1: 0, y1: 0, text: 'hi', size: 9, width: 1 };
  scaleShape(text, 0.1);
  assert.strictEqual(text.size, 8);
  assert.strictEqual(text.width, 1);
});

// Undo pops the last shape, so counting badges is what renumbers the next one.
test('nextNumber follows the badges currently in the document', () => {
  const shapes = [{ type: 'rect' }, { type: 'number' }, { type: 'number' }];
  assert.strictEqual(nextNumber(shapes), 3);
  shapes.pop();
  assert.strictEqual(nextNumber(shapes), 2);
  assert.strictEqual(nextNumber([]), 1);
});
