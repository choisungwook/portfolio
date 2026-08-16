(function registerEditorGeometry(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(require('./constants.js'), require('./shapes.js'))
    : factory(root.makepresentationEditorConstants, root.makepresentationEditorShapes);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorGeometry = api;
})(globalThis, function createEditorGeometry(C, Shapes) {
  'use strict';

  const { BOXY, DEFAULT_STYLE } = C;
  const { nextGroupId } = Shapes;

function dragShape(shape, x0, y0, x, y, constrain) {
  if (shape.kind === 'pen') {
    const last = shape.points[shape.points.length - 1];
    if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) >= 2) {
      shape.points.push([x, y]);
    }
  } else if (BOXY.has(shape.kind)) {
    let w = x - x0;
    let h = y - y0;
    if (constrain) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = w < 0 ? -size : size;
      h = h < 0 ? -size : size;
    }
    shape.x = Math.min(x0, x0 + w);
    shape.y = Math.min(y0, y0 + h);
    shape.w = Math.abs(w);
    shape.h = Math.abs(h);
  } else {
    let w = x - x0;
    let h = y - y0;
    if (constrain) {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(h, w) / step) * step;
      const length = Math.hypot(w, h);
      // Rounding kills the 1e-16 leftovers that would make a "horizontal"
      // line one hair off horizontal.
      w = Math.round(Math.cos(angle) * length * 100) / 100;
      h = Math.round(Math.sin(angle) * length * 100) / 100;
    }
    shape.x = x0;
    shape.y = y0;
    shape.w = w;
    shape.h = h;
  }
}

// True when a just-drawn shape is too small to have been intentional.
function isDegenerate(shape) {
  if (shape.kind === 'pen') return shape.points.length < 2;
  if (BOXY.has(shape.kind)) return shape.w < 4 && shape.h < 4;
  return Math.abs(shape.w) < 4 && Math.abs(shape.h) < 4;
}

function shapeBBox(shape) {
  if (shape.kind === 'pen') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of shape.points) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const x = Math.min(shape.x, shape.x + shape.w);
  const y = Math.min(shape.y, shape.y + shape.h);
  return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
}

function shapeSelectionContainsPoint(shape, x, y) {
  const box = shapeBBox(shape);
  if (!(box.w > 0) || !(box.h > 0)) return false;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const angle = -(Number(shape.rotation) || 0) * Math.PI / 180;
  const dx = x - cx;
  const dy = y - cy;
  const localX = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = cy + dx * Math.sin(angle) + dy * Math.cos(angle);

  if (shape.kind === 'ellipse') {
    const nx = (localX - cx) / (box.w / 2);
    const ny = (localY - cy) / (box.h / 2);
    return nx * nx + ny * ny <= 1;
  }
  return (
    localX >= box.x && localX <= box.x + box.w &&
    localY >= box.y && localY <= box.y + box.h
  );
}

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

// Touching is enough, the way Figma and Illustrator drag-select. Requiring
// full containment looked like a bug that swallowed objects: shapes default
// to no fill, so a drag started in the empty middle of a rectangle begins a
// marquee, and that marquee can never contain the rectangle it started
// inside. The text sitting in the rectangle was caught and the rectangle
// itself was not.
//
// Lines keep being tested by their bounding box, so a diagonal one answers to
// a marquee that only crosses the empty corner of that box. Under a touch
// rule that errs the forgiving way.
function shapeIndicesInRect(shapes, rect) {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return shapes.reduce((indices, shape, index) => {
    const box = shapeBBox(shape);
    const overlaps =
      box.x <= right &&
      box.x + box.w >= rect.x &&
      box.y <= bottom &&
      box.y + box.h >= rect.y;
    if (overlaps) indices.push(index);
    return indices;
  }, []);
}

// Add an unselected item to a selection, or remove it when it is already
// present. Keeping this independent of the page makes modifier-click
// selection use the same valid-index rules as every other selection path.
function toggleSelection(selection, index, length) {
  const current = [...new Set(selection)].filter(
    (selected) => Number.isInteger(selected) && selected >= 0 && selected < length
  );
  if (!Number.isInteger(index) || index < 0 || index >= length) return current;
  return current.includes(index)
    ? current.filter((selected) => selected !== index)
    : [...current, index];
}

function moveShape(shape, dx, dy) {
  if (shape.kind === 'pen') {
    for (const p of shape.points) {
      p[0] += dx;
      p[1] += dy;
    }
  } else {
    shape.x += dx;
    shape.y += dy;
  }
}

function visualShapeBBox(shape) {
  return rotatedBBox(shapeBBox(shape), Number(shape.rotation) || 0);
}

function boundsForShapes(shapes) {
  if (!shapes.length) return null;
  const boxes = shapes.map(visualShapeBBox);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function validShapeIndices(shapes, indices) {
  return [...new Set(indices)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < shapes.length
  );
}

function alignShapes(shapes, indices, edge) {
  const selected = validShapeIndices(shapes, indices);
  if (selected.length < 2 || !['top', 'bottom', 'left', 'right'].includes(edge)) return false;
  const boxes = selected.map((index) => visualShapeBBox(shapes[index]));
  const target = edge === 'top'
    ? Math.min(...boxes.map((box) => box.y))
    : edge === 'bottom'
    ? Math.max(...boxes.map((box) => box.y + box.h))
    : edge === 'left'
    ? Math.min(...boxes.map((box) => box.x))
    : Math.max(...boxes.map((box) => box.x + box.w));
  selected.forEach((index, offset) => {
    const box = boxes[offset];
    const current = edge === 'top' ? box.y
      : edge === 'bottom' ? box.y + box.h
      : edge === 'left' ? box.x
      : box.x + box.w;
    const dx = edge === 'left' || edge === 'right' ? target - current : 0;
    const dy = edge === 'top' || edge === 'bottom' ? target - current : 0;
    moveShape(shapes[index], dx, dy);
  });
  return true;
}

function closestSnap(candidates, threshold) {
  return candidates.reduce((closest, candidate) => {
    if (Math.abs(candidate.offset) > threshold) return closest;
    if (!closest || Math.abs(candidate.offset) < Math.abs(closest.offset)) return candidate;
    return closest;
  }, null);
}

function snapMove(shapes, indices, dx, dy, threshold) {
  const selected = validShapeIndices(shapes, indices);
  const selectedSet = new Set(selected);
  const moving = boundsForShapes(selected.map((index) => shapes[index]));
  const targets = shapes.filter((_, index) => !selectedSet.has(index)).map(visualShapeBBox);
  if (!moving || targets.length === 0 || !(threshold >= 0)) {
    return { dx, dy, vertical: null, horizontal: null };
  }
  const left = moving.x + dx;
  const right = left + moving.w;
  const top = moving.y + dy;
  const bottom = top + moving.h;
  const vertical = closestSnap(targets.flatMap((box) => [
    { offset: box.x - left, line: box.x },
    { offset: box.x + box.w - right, line: box.x + box.w },
  ]), threshold);
  const horizontal = closestSnap(targets.flatMap((box) => [
    { offset: box.y - top, line: box.y },
    { offset: box.y + box.h - bottom, line: box.y + box.h },
  ]), threshold);
  return {
    dx: dx + (vertical ? vertical.offset : 0),
    dy: dy + (horizontal ? horizontal.offset : 0),
    vertical: vertical ? vertical.line : null,
    horizontal: horizontal ? horizontal.line : null,
  };
}

function groupShapes(shapes, indices) {
  const valid = [...new Set(indices)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < shapes.length
  );
  if (valid.length < 2) return '';
  const id = nextGroupId();
  for (const index of valid) shapes[index].groupId = id;
  return id;
}

function ungroupShapes(shapes, indices) {
  const ids = new Set(indices.map((index) => shapes[index] && shapes[index].groupId).filter(Boolean));
  if (ids.size === 0) return false;
  for (const shape of shapes) {
    if (ids.has(shape.groupId)) shape.groupId = '';
  }
  return true;
}

function groupIndicesFor(shapes, index) {
  const shape = shapes[index];
  if (!shape || !shape.groupId) return Number.isInteger(index) ? [index] : [];
  return shapes.reduce((indices, candidate, candidateIndex) => {
    if (candidate.groupId === shape.groupId) indices.push(candidateIndex);
    return indices;
  }, []);
}

function handlesFor(shape) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    return [
      { id: 'start', x: shape.x, y: shape.y },
      { id: 'end', x: shape.x + shape.w, y: shape.y + shape.h },
    ];
  }
  const b = shapeBBox(shape);
  return [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h },
  ];
}

const MIN_SIZE = 8;

function resizeLineEndpoint(shape, from, handle, dx, dy) {
  const endX = from.x + from.w;
  const endY = from.y + from.h;
  if (handle === 'start') {
    shape.x = from.x + dx;
    shape.y = from.y + dy;
    shape.w = endX - shape.x;
    shape.h = endY - shape.y;
  } else {
    shape.x = from.x;
    shape.y = from.y;
    shape.w = from.w + dx;
    shape.h = from.h + dy;
  }
}

function projectOnAxis(x, y, fixedX, fixedY, axisX, axisY) {
  const lengthSquared = axisX * axisX + axisY * axisY;
  if (lengthSquared === 0) return { x, y };
  const scale = ((x - fixedX) * axisX + (y - fixedY) * axisY) / lengthSquared;
  return {
    x: fixedX + axisX * scale,
    y: fixedY + axisY * scale,
  };
}

function resizeLineOnAxis(shape, from, handle, dx, dy) {
  const endX = from.x + from.w;
  const endY = from.y + from.h;
  if (handle === 'start') {
    const point = projectOnAxis(
      from.x + dx,
      from.y + dy,
      endX,
      endY,
      -from.w,
      -from.h
    );
    shape.x = point.x;
    shape.y = point.y;
    shape.w = endX - point.x;
    shape.h = endY - point.y;
  } else {
    const point = projectOnAxis(
      endX + dx,
      endY + dy,
      from.x,
      from.y,
      from.w,
      from.h
    );
    shape.x = from.x;
    shape.y = from.y;
    shape.w = point.x - from.x;
    shape.h = point.y - from.y;
  }
}

// Put a shape into the box (x0,y0)-(x1,y1). A pen has no box of its own, so
// its points are scaled out of the box it started in; everything else stores
// the box directly. One place, so a constrained resize and a free one cannot
// disagree about what a target box means.
function setShapeBox(shape, from, x0, y0, x1, y1) {
  if (shape.kind === 'pen') {
    const b = shapeBBox(from);
    const sx = b.w > 0 ? (x1 - x0) / b.w : 1;
    const sy = b.h > 0 ? (y1 - y0) / b.h : 1;
    shape.points = from.points.map(([px, py]) => [
      x0 + (px - b.x) * sx,
      y0 + (py - b.y) * sy,
    ]);
    return;
  }
  shape.x = x0;
  shape.y = y0;
  shape.w = x1 - x0;
  shape.h = y1 - y0;
  if (shape.kind === 'code') {
    const before = shapeBBox(from);
    const after = shapeBBox(shape);
    const scale = Math.min(
      before.w > 0 ? after.w / before.w : 1,
      before.h > 0 ? after.h / before.h : 1
    );
    shape.fontSize = Math.max(1, (Number(from.fontSize) || DEFAULT_STYLE.fontSize) * scale);
  }
}

// Resize by dragging a handle. `from` is the shape as it was when the drag
// started, so repeated calls with a growing delta do not compound.
function resizeShape(shape, from, handle, dx, dy) {
  if (handle === 'start' || handle === 'end') {
    resizeLineEndpoint(shape, from, handle, dx, dy);
    return;
  }

  const b = shapeBBox(from);
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (handle.includes('w')) x0 = Math.min(x0 + dx, x1 - MIN_SIZE);
  if (handle.includes('e')) x1 = Math.max(x1 + dx, x0 + MIN_SIZE);
  if (handle.includes('n')) y0 = Math.min(y0 + dy, y1 - MIN_SIZE);
  if (handle.includes('s')) y1 = Math.max(y1 + dy, y0 + MIN_SIZE);
  setShapeBox(shape, from, x0, y0, x1, y1);
}

// Shift-resizing keeps the proportions the shape already has, so a 400x100
// box stays four times as wide as it is tall at every size. It used to turn a
// rectangle into a square instead, which made shrinking a wide shape grow it
// to the length of its longer side.
function resizeProportional(shape, from, handle, dx, dy) {
  const b = shapeBBox(from);
  // A flat box has no proportion to keep, and scaling it would multiply the
  // zero side by whatever the other one did.
  if (!(b.w > 0) || !(b.h > 0)) {
    resizeShape(shape, from, handle, dx, dy);
    return;
  }
  const fixedX = handle.includes('w') ? b.x + b.w : b.x;
  const fixedY = handle.includes('n') ? b.y + b.h : b.y;
  const scaleW = Math.abs((handle.includes('w') ? b.x + dx : b.x + b.w + dx) - fixedX) / b.w;
  const scaleH = Math.abs((handle.includes('n') ? b.y + dy : b.y + b.h + dy) - fixedY) / b.h;
  // The pointer almost never lands on the diagonal, so the axis it moved
  // furthest from where it started decides the size. Both sides then take that
  // one factor, which is what keeps the proportion.
  const wanted = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH;
  const scale = Math.max(MIN_SIZE / b.w, MIN_SIZE / b.h, wanted);
  const width = b.w * scale;
  const height = b.h * scale;
  const x0 = handle.includes('w') ? fixedX - width : fixedX;
  const y0 = handle.includes('n') ? fixedY - height : fixedY;
  setShapeBox(shape, from, x0, y0, x0 + width, y0 + height);
}

// A line keeps its original axis, including the opposite direction after the
// moving endpoint crosses the fixed one. Every other shape keeps its
// proportions.
function resizeShapeConstrained(shape, from, handle, dx, dy) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    resizeLineOnAxis(shape, from, handle, dx, dy);
    return;
  }
  resizeProportional(shape, from, handle, dx, dy);
}

// --- rotation ------------------------------------------------------------------
//
// Rotation is a render transform about the centre of the shape's box, so x, y,
// w and h never move and the box stays a stable thing to rotate around.

// How far above the box the rotate grip sits, in slide units.
const ROTATE_HANDLE_GAP = 30;

function rotationHandleFor(shape) {
  const b = shapeBBox(shape);
  return { x: b.x + b.w / 2, y: b.y - ROTATE_HANDLE_GAP };
}

function normalizeAngle(degrees) {
  const wrapped = degrees % 360;
  if (wrapped > 180) return wrapped - 360;
  if (wrapped <= -180) return wrapped + 360;
  return wrapped;
}

function unrotateDelta(dx, dy, degrees) {
  const radians = -(Number(degrees) || 0) * Math.PI / 180;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

// The rotation that points a shape's top at (x,y). The grip sits above the
// box, so a shape at rest reads as -90 degrees here and the +90 brings that
// back to zero. `constrain` is the Shift key: quarter turns only.
function rotationTowards(shape, x, y, constrain) {
  const b = shapeBBox(shape);
  const degrees =
    (Math.atan2(y - (b.y + b.h / 2), x - (b.x + b.w / 2)) * 180) / Math.PI + 90;
  return normalizeAngle(constrain ? Math.round(degrees / 90) * 90 : Math.round(degrees));
}

// --- slide operations -------------------------------------------------------

function rotatedBBox(box, degrees) {
  if (!degrees) return box;
  const radians = degrees * Math.PI / 180;
  const width = Math.abs(box.w * Math.cos(radians)) + Math.abs(box.h * Math.sin(radians));
  const height = Math.abs(box.w * Math.sin(radians)) + Math.abs(box.h * Math.cos(radians));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x: cx - width / 2, y: cy - height / 2, w: width, h: height };
}


  return {
    dragShape,
    isDegenerate,
    shapeBBox,
    shapeSelectionContainsPoint,
    normalizeRect,
    shapeIndicesInRect,
    toggleSelection,
    moveShape,
    visualShapeBBox,
    boundsForShapes,
    alignShapes,
    snapMove,
    groupShapes,
    ungroupShapes,
    groupIndicesFor,
    handlesFor,
    resizeShape,
    resizeShapeConstrained,
    rotationHandleFor,
    rotationTowards,
    unrotateDelta,
    rotatedBBox,
  };
});
