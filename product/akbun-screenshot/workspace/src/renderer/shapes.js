'use strict';

// Pure geometry for the editor. Loaded as a plain script by editor.html and
// required by the node test, so the export below is guarded.

// Shift while dragging. A line snaps to the nearest 45 degree step, everything
// else becomes square, which is what turns the ellipse into a circle.
function constrain(type, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (type === 'line') {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const length = Math.hypot(dx, dy);
    return { x: x1 + Math.cos(angle) * length, y: y1 + Math.sin(angle) * length };
  }

  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: x1 + Math.sign(dx) * size, y: y1 + Math.sign(dy) * size };
}

// Counting the existing badges rather than keeping a counter is what makes
// undo renumber for free: remove the last badge and the next one reuses it.
function nextNumber(shapes) {
  return shapes.filter((shape) => shape.type === 'number').length + 1;
}

if (typeof module !== 'undefined') module.exports = { constrain, nextNumber };
