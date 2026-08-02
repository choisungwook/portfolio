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

// Counting only works while the badges are 1..n with nothing missing. Deleting
// one out of the middle breaks that: 1 2 3 minus the first leaves 2 3, and the
// next badge would come out 3 as well. So every delete renumbers in array
// order, which is creation order, and the count is a valid next number again.
function renumber(shapes) {
  let n = 0;
  for (const shape of shapes) {
    if (shape.type === 'number') {
      n += 1;
      shape.n = n;
    }
  }
  return shapes;
}

// Box a shape occupies. Text is estimated from the glyph count rather than
// measured, since this file has no canvas to ask.
function bounds(s) {
  // A pencil stroke is a list of points rather than two corners, so its box is
  // the extent of the run.
  if (s.points) {
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
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
// corner that happens to own both of its shape's coordinates.
function handles(s) {
  // Text and badges hang off one anchor, so there is no corner whose two fields
  // a drag could write. They get a single grip at the bottom right of their box
  // that scales the whole thing instead, marked so the caller knows to run it
  // through scaleShape rather than assign to it.
  if (s.x2 === undefined) {
    const b = bounds(s);
    return [{ scale: true, x: b.x2, y: b.y2 }];
  }
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
  if (s.points) {
    for (const p of s.points) {
      p.x += dx;
      p.y += dy;
    }
    return;
  }
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
  if (s.size !== undefined) s.size = Math.max(8, s.size * factor);
  s.width = Math.max(1, s.width * factor);

  // A pencil stroke has no corners to rewrite, so every point moves instead.
  if (s.points) {
    const cx = (before.x1 + before.x2) / 2;
    const cy = (before.y1 + before.y2) / 2;
    for (const p of s.points) {
      p.x = cx + (p.x - cx) * factor;
      p.y = cy + (p.y - cy) * factor;
    }
    return;
  }

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

// Factor that puts the bottom right of an anchored shape's box under the
// pointer. Measured from the centre because that is the point scaleShape holds
// still, so feeding this straight back in lands the corner where the mouse is
// and the drag tracks instead of drifting.
function scaleFactorAt(s, x, y) {
  const b = bounds(s);
  const cx = (b.x1 + b.x2) / 2;
  const cy = (b.y1 + b.y2) / 2;
  const now = Math.hypot(b.x2 - cx, b.y2 - cy);
  return now > 0 ? Math.hypot(x - cx, y - cy) / now : 1;
}

// Whether any part of the shape is still on an image of this size. A shape
// hanging half over the edge is visible and stays; one entirely outside is what
// the crop was asked to throw away.
function overlaps(s, width, height) {
  const b = bounds(s);
  return b.x2 >= 0 && b.y2 >= 0 && b.x1 <= width && b.y1 <= height;
}

// A crop under this in either direction is a stray click rather than a drag.
const MIN_CROP = 8;

// Crop box in image pixels: corners sorted, clipped to the image, rounded to
// whole pixels so the cropped canvas is not a fraction wide. Null when the drag
// was too small to mean anything, which is what keeps a misclick from
// collapsing the image to nothing.
function cropRect(x1, y1, x2, y2, width, height) {
  const left = Math.round(Math.max(0, Math.min(x1, x2)));
  const top = Math.round(Math.max(0, Math.min(y1, y2)));
  const right = Math.round(Math.min(width, Math.max(x1, x2)));
  const bottom = Math.round(Math.min(height, Math.max(y1, y2)));
  if (right - left < MIN_CROP || bottom - top < MIN_CROP) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

if (typeof module !== 'undefined') {
  module.exports = {
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
  };
}
