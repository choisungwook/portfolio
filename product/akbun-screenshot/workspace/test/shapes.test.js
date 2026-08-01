'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const {
  constrain,
  nextNumber,
  bounds,
  hitTest,
  handles,
  handleAt,
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

test('handles puts a grip on each corner of a box shape', () => {
  const rect = { type: 'rect', x1: 0, y1: 10, x2: 100, y2: 60 };
  assert.deepStrictEqual(
    handles(rect).map((h) => [h.x, h.y]),
    [[0, 10], [100, 10], [0, 60], [100, 60]]
  );
});

// A segment has no corners worth pulling, only its two ends.
test('handles puts a grip on each end of a segment', () => {
  const arrow = { type: 'arrow', x1: 0, y1: 0, x2: 50, y2: 80 };
  assert.deepStrictEqual(handles(arrow).map((h) => [h.x, h.y]), [[0, 0], [50, 80]]);
});

// Text and badges hang off one anchor, so there is no corner to drag and the
// [ ] keys stay the only way to resize them.
test('handles gives an anchored shape nothing to grab', () => {
  assert.deepStrictEqual(handles({ type: 'text', x1: 0, y1: 0, text: 'hi', size: 20 }), []);
});

// Writing the two named fields is what a grip drag does, so the names have to
// be the corner the grip sits on.
test('handleAt names the fields the grabbed corner writes', () => {
  const rect = { type: 'rect', x1: 0, y1: 10, x2: 100, y2: 60 };
  const grip = handleAt(rect, 98, 12, 6);
  assert.deepStrictEqual({ fx: grip.fx, fy: grip.fy }, { fx: 'x2', fy: 'y1' });
  assert.strictEqual(handleAt(rect, 50, 35, 6), null);
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

// Text hangs from its top left, so growing the glyph pushes the box down and to
// the right unless the anchor is pulled back by half of what the box gained.
test('scaleShape keeps text centred on the same point', () => {
  const text = { type: 'text', x1: 100, y1: 100, text: 'hello', size: 20, width: 3 };
  const before = bounds(text);
  scaleShape(text, 2);
  const after = bounds(text);
  assert.strictEqual((after.x1 + after.x2) / 2, (before.x1 + before.x2) / 2);
  assert.strictEqual((after.y1 + after.y2) / 2, (before.y1 + before.y2) / 2);
  assert.strictEqual(after.x2 - after.x1, (before.x2 - before.x1) * 2);
});

// A badge is already centred on its anchor, so the same re-anchoring must be a
// no-op for it rather than shifting it by half the growth.
test('scaleShape leaves a badge anchor where it was', () => {
  const badge = { type: 'number', x1: 50, y1: 60, n: 1, size: 20, width: 3 };
  scaleShape(badge, 1.5);
  assert.strictEqual(badge.x1, 50);
  assert.strictEqual(badge.y1, 60);
  assert.strictEqual(badge.size, 30);
});

test('scaleShape clamps size and stroke so a shape cannot vanish', () => {
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
