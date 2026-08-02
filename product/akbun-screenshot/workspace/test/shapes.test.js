'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const {
  constrain,
  nextNumber,
  renumber,
  bounds,
  hitTest,
  handles,
  handleAt,
  moveShape,
  scaleShape,
  scaleFactorAt,
  overlaps,
  cropRect,
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

// Text and badges have no corner whose fields a drag could write, so their one
// grip sits at the bottom right of the box and is marked for scaling instead.
test('handles gives an anchored shape one scaling grip', () => {
  const text = { type: 'text', x1: 0, y1: 0, text: 'hi', size: 20 };
  const box = bounds(text);
  assert.deepStrictEqual(handles(text), [{ scale: true, x: box.x2, y: box.y2 }]);

  const badge = { type: 'number', x1: 50, y1: 50, n: 1, size: 20 };
  assert.deepStrictEqual(handles(badge), [{ scale: true, x: 66, y: 66 }]);
});

// A grip that does not follow the pointer is the one bug worth catching here:
// feeding the factor back into scaleShape has to land the corner under the
// mouse, not somewhere on the way to it.
test('scaleFactorAt puts the grip under the pointer', () => {
  for (const shape of [
    { type: 'text', x1: 100, y1: 100, text: 'hello', size: 20, width: 3 },
    { type: 'number', x1: 100, y1: 100, n: 1, size: 20, width: 3 },
  ]) {
    const target = { x: 260, y: 190 };
    scaleShape(shape, scaleFactorAt(shape, target.x, target.y));
    const after = bounds(shape);
    const cx = (after.x1 + after.x2) / 2;
    const cy = (after.y1 + after.y2) / 2;
    // The corner tracks the pointer's distance from the centre. The direction
    // is fixed by the box, so a diagonal drag is what puts it exactly there.
    assert.ok(
      Math.abs(
        Math.hypot(after.x2 - cx, after.y2 - cy) - Math.hypot(target.x - cx, target.y - cy)
      ) < 1e-6,
      shape.type
    );
  }
});

// Dragging the grip onto the centre asks for a factor of 0. scaleShape's floor
// is what keeps the shape from vanishing with nothing left to grab.
test('scaleFactorAt survives a drag onto the shape centre', () => {
  const text = { type: 'text', x1: 100, y1: 100, text: 'hello', size: 20, width: 3 };
  const box = bounds(text);
  const factor = scaleFactorAt(text, (box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2);
  assert.strictEqual(factor, 0);
  scaleShape(text, factor);
  assert.strictEqual(text.size, 8);
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

// A pencil stroke is a run of points rather than two corners, so every function
// that reads a shape's geometry has to go through the point list instead.
test('bounds wraps a pencil stroke around its points', () => {
  const stroke = { type: 'pencil', points: [{ x: 30, y: 90 }, { x: 10, y: 40 }, { x: 50, y: 60 }] };
  assert.deepStrictEqual(bounds(stroke), { x1: 10, y1: 40, x2: 50, y2: 90 });
  assert.strictEqual(hitTest([stroke], 20, 50), stroke);
  assert.strictEqual(hitTest([stroke], 60, 50), null);
});

test('moveShape shifts every point of a pencil stroke', () => {
  const stroke = { type: 'pencil', points: [{ x: 0, y: 0 }, { x: 10, y: 20 }] };
  moveShape(stroke, 5, -5);
  assert.deepStrictEqual(stroke.points, [{ x: 5, y: -5 }, { x: 15, y: 15 }]);
});

// It has no size field, so the clamp that keeps text readable must not turn the
// stroke's geometry into NaN on the way past.
test('scaleShape grows a pencil stroke about its centre', () => {
  const stroke = { type: 'pencil', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], width: 3 };
  scaleShape(stroke, 2);
  assert.deepStrictEqual(stroke.points, [{ x: -50, y: -50 }, { x: 150, y: 150 }]);
  assert.strictEqual(stroke.width, 6);
  assert.strictEqual(stroke.size, undefined);
});

// One grip, the same as text and badges, since there is no corner whose two
// fields a drag could write.
test('handles gives a pencil stroke one scaling grip', () => {
  const stroke = { type: 'pencil', points: [{ x: 0, y: 0 }, { x: 40, y: 20 }] };
  assert.deepStrictEqual(handles(stroke), [{ scale: true, x: 40, y: 20 }]);
});

test('scaleShape clamps size and stroke so a shape cannot vanish', () => {
  const text = { type: 'text', x1: 0, y1: 0, text: 'hi', size: 9, width: 1 };
  scaleShape(text, 0.1);
  assert.strictEqual(text.size, 8);
  assert.strictEqual(text.width, 1);
});

// Undo restores the whole list, so counting badges is what renumbers the next one.
test('nextNumber follows the badges currently in the document', () => {
  const shapes = [{ type: 'rect' }, { type: 'number' }, { type: 'number' }];
  assert.strictEqual(nextNumber(shapes), 3);
  shapes.pop();
  assert.strictEqual(nextNumber(shapes), 2);
  assert.strictEqual(nextNumber([]), 1);
});

// Deleting badge 1 out of 1 2 3 leaves 2 3, where a count of 2 makes the next
// badge a second 3. Renumbering is what keeps the run 1..n so counting works.
test('renumber closes the gap a deleted badge leaves', () => {
  const shapes = [
    { type: 'number', n: 1 },
    { type: 'rect' },
    { type: 'number', n: 2 },
    { type: 'number', n: 3 },
  ];
  shapes.splice(0, 1);
  renumber(shapes);
  assert.deepStrictEqual(
    shapes.filter((s) => s.type === 'number').map((s) => s.n),
    [1, 2]
  );
  assert.strictEqual(nextNumber(shapes), 3);
});

test('renumber leaves everything that is not a badge alone', () => {
  const shapes = [{ type: 'rect', n: 9 }, { type: 'text', n: 9 }];
  renumber(shapes);
  assert.deepStrictEqual(shapes.map((s) => s.n), [9, 9]);
});

// A shape the crop cut away has to leave the list. Left in, it is invisible and
// unclickable but nextNumber still counts it, so the badges stop being 1..n.
test('overlaps keeps what is still on the image and drops what is not', () => {
  const on = { type: 'rect', x1: 10, y1: 10, x2: 50, y2: 50 };
  const off = { type: 'rect', x1: -300, y1: -200, x2: -250, y2: -150 };
  const straddling = { type: 'rect', x1: -20, y1: -20, x2: 30, y2: 30 };
  assert.strictEqual(overlaps(on, 100, 100), true);
  assert.strictEqual(overlaps(off, 100, 100), false);
  assert.strictEqual(overlaps(straddling, 100, 100), true, 'half on screen is still visible');
  assert.strictEqual(overlaps({ type: 'rect', x1: 120, y1: 10, x2: 200, y2: 40 }, 100, 100), false);
});

// A badge is a circle around its anchor, so it can be on screen with the anchor
// off it. Going by the anchor alone would delete a badge the user can see.
test('overlaps measures a badge by its circle, not its anchor', () => {
  const badge = { type: 'number', x1: -8, y1: 50, n: 1, size: 20 };
  assert.strictEqual(overlaps(badge, 100, 100), true);
  assert.strictEqual(overlaps({ ...badge, x1: -40 }, 100, 100), false);
});

// The whole point of the drop: crop away badges 1 and 2 and the survivor
// renumbers to 1, so the next badge is 2 rather than a 4 nothing on screen uses.
test('dropping cropped-away badges keeps the run countable', () => {
  const shapes = [
    { type: 'number', n: 1, x1: 100, y1: 100, size: 20 },
    { type: 'number', n: 2, x1: 300, y1: 200, size: 20 },
    { type: 'number', n: 3, x1: 700, y1: 600, size: 20 },
  ];
  const rect = cropRect(600, 500, 900, 750, 1000, 800);
  for (const shape of shapes) moveShape(shape, -rect.x, -rect.y);

  const kept = renumber(shapes.filter((s) => overlaps(s, rect.width, rect.height)));
  assert.deepStrictEqual(kept.map((s) => s.n), [1]);
  assert.strictEqual(nextNumber(kept), 2);
});

test('cropRect sorts the corners of a backwards drag', () => {
  assert.deepStrictEqual(cropRect(180, 160, 40, 30, 400, 300), {
    x: 40,
    y: 30,
    width: 140,
    height: 130,
  });
});

// The drag is tracked on window, so it keeps running past the edge of the
// image. Without the clamp the cropped canvas would carry transparent margins.
test('cropRect clips a drag that ran off the image', () => {
  assert.deepStrictEqual(cropRect(-50, -20, 900, 700, 400, 300), {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  });
});

// A stray click on the crop tool must not collapse the image to nothing.
test('cropRect refuses a box too small to be a drag', () => {
  assert.strictEqual(cropRect(10, 10, 12, 90, 400, 300), null);
  assert.strictEqual(cropRect(10, 10, 90, 12, 400, 300), null);
  assert.strictEqual(cropRect(10, 10, 10, 10, 400, 300), null);
});

// A fractional canvas width is rounded down by the browser, so the crop has to
// pick whole pixels itself or the copied region and the canvas disagree.
test('cropRect returns whole pixels', () => {
  const rect = cropRect(10.4, 20.6, 100.5, 200.2, 400, 300);
  for (const value of Object.values(rect)) {
    assert.strictEqual(value, Math.round(value));
  }
});
