'use strict';

// Pure geometry for the editor. Loaded as a plain script by editor.html and
// required by the node test, so the export below is guarded.

// Drawn as a segment between the two drag points. Arrows differ from a line
// only in the heads, so they snap to 45 degrees the same way.
const SEGMENTS = ['line', 'arrow', 'arrow2'];

// Shift while dragging. A segment snaps to the nearest 45 degree step,
// everything else becomes square, which is what turns the ellipse into a circle.
function constrain(type, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (SEGMENTS.includes(type)) {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const length = Math.hypot(dx, dy);
    return { x: x1 + Math.cos(angle) * length, y: y1 + Math.sin(angle) * length };
  }

  // Not Math.sign, which is 0 for an axis that has not moved. A drag straight
  // down would then square to zero width and the circle would vanish.
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: x1 + (dx < 0 ? -size : size), y: y1 + (dy < 0 ? -size : size) };
}

// Counting the existing badges rather than keeping a counter is what makes
// undo renumber for free: remove the last badge and the next one reuses it.
function nextNumber(shapes) {
  return shapes.filter((shape) => shape.type === 'number').length + 1;
}

// Box a shape occupies. Text is estimated from the glyph count rather than
// measured, since this file has no canvas to ask.
function bounds(s) {
  if (s.type === 'text') {
    return { x1: s.x1, y1: s.y1, x2: s.x1 + s.text.length * s.size * 0.6, y2: s.y1 + s.size };
  }
  if (s.type === 'number') {
    const radius = s.size * 0.8;
    return { x1: s.x1 - radius, y1: s.y1 - radius, x2: s.x1 + radius, y2: s.y1 + radius };
  }
  return {
    x1: Math.min(s.x1, s.x2),
    y1: Math.min(s.y1, s.y2),
    x2: Math.max(s.x1, s.x2),
    y2: Math.max(s.y1, s.y2),
  };
}

// Topmost first, so the shape drawn last is the one a click picks up.
// A box test rather than an outline test: clicking inside an empty rectangle
// selects it, which is what you want when the point is to drag it. The cost is
// a diagonal line whose box reaches well past the stroke.
function hitTest(shapes, x, y, pad = 0) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const b = bounds(shapes[i]);
    if (x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad) return shapes[i];
  }
  return null;
}

// Grips drawn on a selected shape. Each one names the two fields it writes, so
// dragging a grip is a two field assignment and a segment endpoint is just the
// corner that happens to own both of its shape's coordinates. Text and badges
// hang off one anchor and have no corner to pull, so they keep the [ ] keys.
function handles(s) {
  if (s.x2 === undefined) return [];
  const corners = SEGMENTS.includes(s.type)
    ? [['x1', 'y1'], ['x2', 'y2']]
    : [['x1', 'y1'], ['x2', 'y1'], ['x1', 'y2'], ['x2', 'y2']];
  return corners.map(([fx, fy]) => ({ fx, fy, x: s[fx], y: s[fy] }));
}

// Grips win over the shape itself, otherwise a corner grip sitting on the
// outline would start a move instead of a resize.
function handleAt(s, x, y, radius) {
  return handles(s).find((h) => Math.hypot(h.x - x, h.y - y) <= radius) || null;
}

function moveShape(s, dx, dy) {
  s.x1 += dx;
  s.y1 += dy;
  // Text and badges are anchored by one point and have no second corner.
  if (s.x2 === undefined) return;
  s.x2 += dx;
  s.y2 += dy;
}

// Scales about the shape's own centre, so resizing does not walk it across the
// image. Stroke follows, otherwise a shrunk shape keeps a fat outline.
function scaleShape(s, factor) {
  const before = bounds(s);
  s.size = Math.max(8, s.size * factor);
  s.width = Math.max(1, s.width * factor);

  // Text hangs from its top left corner, so a bigger glyph grows down and to
  // the right and the centre drifts. Re-anchoring by how far the box moved
  // fixes that, and costs a badge nothing since its box is already centred on
  // the anchor.
  if (s.x2 === undefined) {
    const after = bounds(s);
    s.x1 += (before.x1 + before.x2 - after.x1 - after.x2) / 2;
    s.y1 += (before.y1 + before.y2 - after.y1 - after.y2) / 2;
    return;
  }

  const cx = (s.x1 + s.x2) / 2;
  const cy = (s.y1 + s.y2) / 2;
  s.x1 = cx + (s.x1 - cx) * factor;
  s.x2 = cx + (s.x2 - cx) * factor;
  s.y1 = cy + (s.y1 - cy) * factor;
  s.y2 = cy + (s.y2 - cy) * factor;
}

if (typeof module !== 'undefined') {
  module.exports = {
    constrain,
    nextNumber,
    bounds,
    hitTest,
    handles,
    handleAt,
    moveShape,
    scaleShape,
  };
}
