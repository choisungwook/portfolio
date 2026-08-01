'use strict';

/* global constrain, nextNumber, hitTest, bounds, handles, handleAt, moveShape,
   scaleShape, fillFontSelect, wireFontSelect */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('wrap');
const colorInput = document.getElementById('color');
const fontSelect = document.getElementById('font');
const sizeInput = document.getElementById('size');
const strokeInput = document.getElementById('stroke');

// The whole document is the undo history: undo moves the last shape into
// `undone`, redo moves it back. Nothing else is stored, so redrawing from the
// original image and this list always reproduces the current state.
const shapes = [];
const undone = [];

let tool = 'select';
let draft = null;

// Select mode. `selected` is the shape the outline is drawn around, `dragFrom`
// the last mouse position while it is being pushed around, `resizing` the corner
// grip being pulled when the drag started on one.
let selected = null;
let dragFrom = null;
let resizing = null;

// Radius of a corner grip in css pixels, and how far off one a click still
// counts as grabbing it.
const HANDLE = 6;
const GRAB = 10;

// Image pixels per css pixel. The png from a retina display is twice the size
// it is shown at, so a 3px stroke would come out half as thick as it looks.
let unit = 1;

const image = new Image();

window.api.editorImage().then((dataUrl) => {
  image.src = dataUrl;
});

// Both boxes are in image pixels, so what is typed is what is drawn. The
// defaults are the on screen 24px and 3px scaled up to match, which is why they
// are functions of unit rather than constants.
const defaultSize = () => Math.round(24 * unit);
const defaultStroke = () => Math.max(1, Math.round(3 * unit));

image.onload = () => {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const shown = canvas.getBoundingClientRect().width;
  unit = shown > 0 ? image.naturalWidth / shown : 1;
  sizeInput.value = defaultSize();
  strokeInput.value = defaultStroke();
  redraw();
};

window.api.getSettings().then((settings) => {
  fillFontSelect(fontSelect, [settings.defaultFont], settings.defaultFont);
  wireFontSelect(fontSelect, () => fontSelect.value || settings.defaultFont);
});

function redraw() {
  if (!image.complete) return;
  ctx.drawImage(image, 0, 0);
  for (const shape of shapes) drawShape(shape);
  if (draft) drawShape(draft);
  if (selected) drawSelection(selected);
}

// Drawn on the canvas rather than as an overlay element, which keeps the one
// redraw path. Save clears the selection first so neither the outline nor the
// grips are ever exported.
function drawSelection(s) {
  const b = bounds(s);
  const pad = 4 * unit;
  ctx.save();
  ctx.strokeStyle = '#4da3ff';
  ctx.lineWidth = Math.max(1, unit);
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);

  ctx.setLineDash([]);
  ctx.fillStyle = '#4da3ff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 2 * unit);
  for (const handle of handles(s)) {
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, HANDLE * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawShape(s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  // A round cap sticks out half a stroke past the endpoint, which on an arrow
  // shows up as a bead poking through the tip of the head.
  ctx.lineCap = s.type === 'arrow' || s.type === 'arrow2' ? 'butt' : 'round';

  if (s.type === 'rect') {
    ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
  } else if (s.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      (s.x1 + s.x2) / 2,
      (s.y1 + s.y2) / 2,
      Math.abs(s.x2 - s.x1) / 2,
      Math.abs(s.y2 - s.y1) / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else if (s.type === 'line' || s.type === 'arrow' || s.type === 'arrow2') {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    if (s.type !== 'line') arrowHead(s.x1, s.y1, s.x2, s.y2, s.width);
    if (s.type === 'arrow2') arrowHead(s.x2, s.y2, s.x1, s.y1, s.width);
  } else if (s.type === 'text') {
    ctx.font = `${s.size}px "${s.font}"`;
    ctx.textBaseline = 'top';
    ctx.fillText(s.text, s.x1, s.y1);
  } else if (s.type === 'number') {
    ctx.beginPath();
    ctx.arc(s.x1, s.y1, s.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${s.size}px "${s.font}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.n), s.x1, s.y1);
  }

  ctx.restore();
}

// Filled triangle at (toX, toY) pointing away from (fromX, fromY). Called from
// inside drawShape, so fillStyle is already the shape's color. The head follows
// the stroke width, otherwise a thick arrow ends in a pinhead. Seven times and a
// 30 degree spread rather than something tighter, because at four the head was
// close enough to the line's own thickness that the arrow read as a plain line.
function arrowHead(fromX, fromY, toX, toY, width) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const length = width * 7;
  const spread = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - length * Math.cos(angle - spread), toY - length * Math.sin(angle - spread));
  ctx.lineTo(toX - length * Math.cos(angle + spread), toY - length * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
}

// An emptied box falls back to the same value the image load put there, not to
// a bare 24 and 3. On a retina capture those two numbers are half the intended
// size, so the fallback has to carry the scale as well.
function style() {
  return {
    color: colorInput.value,
    width: Math.max(1, Number(strokeInput.value) || defaultStroke()),
    size: Number(sizeInput.value) || defaultSize(),
    font: fontSelect.value,
  };
}

// A new shape kills the redo stack, the same as any editor.
function push(shape) {
  shapes.push(shape);
  undone.length = 0;
  redraw();
}

// Css coordinates read live, since the window is resizable and the canvas
// scales down to fit it.
function toImage(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousedown', (event) => {
  const point = toImage(event);

  if (tool === 'select') {
    // A grip on the current selection is checked before anything else, since it
    // sits on the outline where the shape below would otherwise take the click.
    resizing = selected ? handleAt(selected, point.x, point.y, GRAB * unit) : null;
    if (resizing) return;

    // A generous pad, because a thin line is hard to land on exactly.
    selected = hitTest(shapes, point.x, point.y, 6 * unit);
    dragFrom = selected ? point : null;
    redraw();
    return;
  }
  if (tool === 'number') {
    push({ type: 'number', x1: point.x, y1: point.y, n: nextNumber(shapes), ...style() });
    return;
  }
  if (tool === 'text') {
    // The default action of mousedown moves focus off the input we are about to
    // create, which fires its blur handler and removes it in the same frame.
    // That is why the text box used to never appear.
    event.preventDefault();
    askText(event, point);
    return;
  }
  draft = { type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y, ...style() };
});

// On window rather than on the canvas, so a drag that leaves the image still
// tracks and still finishes.
window.addEventListener('mousemove', (event) => {
  const point = toImage(event);

  // Shift squares the shape or snaps the segment while resizing, the same as it
  // does while drawing one, since the grip drags the same corner the draw did.
  if (resizing) {
    // The corner diagonally across from the grip, which is the one that stays put.
    const anchor = {
      x: selected[resizing.fx === 'x1' ? 'x2' : 'x1'],
      y: selected[resizing.fy === 'y1' ? 'y2' : 'y1'],
    };
    const end = event.shiftKey
      ? constrain(selected.type, anchor.x, anchor.y, point.x, point.y)
      : point;
    selected[resizing.fx] = end.x;
    selected[resizing.fy] = end.y;
    redraw();
    return;
  }

  // A move is not undoable, undo only covers adding shapes. Recording the start
  // position on mousedown would fix it if it turns out to matter.
  if (dragFrom) {
    moveShape(selected, point.x - dragFrom.x, point.y - dragFrom.y);
    dragFrom = point;
    redraw();
    return;
  }

  if (!draft) return;
  const end = event.shiftKey
    ? constrain(draft.type, draft.x1, draft.y1, point.x, point.y)
    : point;
  draft.x2 = end.x;
  draft.y2 = end.y;
  redraw();
});

window.addEventListener('mouseup', () => {
  dragFrom = null;
  resizing = null;
  if (!draft) return;
  const shape = draft;
  draft = null;
  // A click with no drag would leave an invisible zero sized shape in the history.
  if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 2) push(shape);
  else redraw();
});

// Inline input instead of prompt(), which Electron does not support.
function askText(event, point) {
  const rect = wrap.getBoundingClientRect();
  const input = document.createElement('input');
  input.className = 'text-input';
  input.style.left = `${event.clientX - rect.left}px`;
  input.style.top = `${event.clientY - rect.top}px`;
  input.style.color = colorInput.value;
  input.style.font = `${Math.round(Number(sizeInput.value) / unit)}px "${fontSelect.value}"`;
  wrap.appendChild(input);
  input.focus();

  input.addEventListener('keydown', (keyEvent) => {
    // Otherwise Cmd+Z while typing would undo the drawing behind the input.
    keyEvent.stopPropagation();
    if (keyEvent.key === 'Escape') input.remove();
    if (keyEvent.key !== 'Enter') return;
    if (input.value.trim()) {
      push({ type: 'text', x1: point.x, y1: point.y, text: input.value, ...style() });
    }
    input.remove();
  });

  input.addEventListener('blur', () => input.remove());
}

// Resizing an existing shape. Two keys rather than a box, since the shape is
// already selected and one tap per step is faster than typing a number. Two and
// only two, so the toolbar hint can name every key that does this.
const SCALE_KEYS = { '[': 1 / 1.1, ']': 1.1 };

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    const from = event.shiftKey ? undone : shapes;
    const to = event.shiftKey ? shapes : undone;
    const shape = from.pop();
    if (shape) to.push(shape);
    // The outline would otherwise stay on a shape that is no longer in the list.
    selected = null;
    redraw();
    return;
  }

  // Otherwise typing a minus into the size box would shrink the selected shape.
  const typing = event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT';
  if (!selected || typing) return;
  if (event.key === 'Escape') {
    selected = null;
    redraw();
    return;
  }
  const factor = SCALE_KEYS[event.key];
  if (!factor) return;
  event.preventDefault();
  scaleShape(selected, factor);
  redraw();
});

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    if (tool !== 'select') selected = null;
    for (const other of document.querySelectorAll('[data-tool]')) {
      other.classList.toggle('active', other === button);
    }
    redraw();
  });
}

document.getElementById('save').addEventListener('click', () => {
  // The dashed outline lives on the canvas, so it has to go before the export.
  selected = null;
  redraw();
  window.api.saveEditor(canvas.toDataURL('image/png'));
});

document.getElementById('close').addEventListener('click', () => window.api.closeEditor());

// The canvas scales with the window, so the ratio behind stroke width has to
// follow it. Existing shapes keep the width they were drawn with.
window.addEventListener('resize', () => {
  const shown = canvas.getBoundingClientRect().width;
  if (shown > 0 && canvas.width > 0) unit = canvas.width / shown;
});
