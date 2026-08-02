'use strict';

/* global constrain, nextNumber, renumber, hitTest, bounds, handles, handleAt,
   moveShape, scaleShape, scaleFactorAt, overlaps, cropRect, fillFontSelect,
   wireFontSelect */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('wrap');
const colorInput = document.getElementById('color');
const fontSelect = document.getElementById('font');
const sizeInput = document.getElementById('size');
const strokeInput = document.getElementById('stroke');

// The document: the shapes drawn so far over the image they sit on. Redrawing
// from these two always reproduces the current state, so nothing else is kept.
const shapes = [];

// The picture under the shapes, an <img> until a crop replaces it with a
// smaller canvas. A crop builds a new one and never touches the old, which is
// what lets a history entry hold it by reference.
let base = null;

// Undo used to pop the last shape off the list and redo pushed it back. Delete
// takes a shape out of the middle, which that model cannot express: undoing
// after one would pop whatever happened to be last and the deleted shape would
// never come back. So each entry is the whole document as it was before a
// change. Copies are shallow because a shape holds only numbers and strings,
// and a crop hands over the old base canvas rather than copying its pixels.
const past = [];
const future = [];

let tool = 'select';
let draft = null;

// Select mode. `selected` is the shape the outline is drawn around, `dragFrom`
// the last mouse position while it is being pushed around, `resizing` the corner
// grip being pulled when the drag started on one.
let selected = null;
let dragFrom = null;
let resizing = null;

// A mousedown that picks a shape up may turn out to be a plain click. Recording
// the document then would fill the history with entries that undo to the state
// they were taken from, so the entry waits for the first mousemove that
// actually changes something.
let pendingCommit = false;

// Whether Delete and Backspace remove the selected shape. Off in settings for
// anyone who keeps hitting them by accident; the toolbar has no delete button
// because a shape has to be selected first and Esc is right there.
let deleteKeys = true;

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
  base = image;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  measureUnit();
  sizeInput.value = defaultSize();
  strokeInput.value = defaultStroke();
  redraw();
};

// The canvas is laid out to fit the window, so the ratio has to be read back
// from the page rather than assumed. Called again after every crop, since a
// smaller image is shown at a different size.
function measureUnit() {
  const shown = canvas.getBoundingClientRect().width;
  if (shown > 0 && canvas.width > 0) unit = canvas.width / shown;
}

window.api.getSettings().then((settings) => {
  deleteKeys = settings.deleteKeys !== false;
  fillFontSelect(fontSelect, [settings.defaultFont], settings.defaultFont);
  wireFontSelect(fontSelect, () => fontSelect.value || settings.defaultFont);
});

// Read again whenever the window comes back, the way the settings page rechecks
// permissions. Someone who has just lost a shape to a stray Backspace goes
// straight to Settings and turns the keys off; without this they would have to
// close the editor to pick the change up, and closing throws the annotations
// away. The font is not re-read because the picker is already on screen and
// resetting it under the user would be worse than leaving it.
window.addEventListener('focus', () => {
  window.api.getSettings().then((settings) => {
    deleteKeys = settings.deleteKeys !== false;
  });
});

function redraw() {
  if (!base) return;
  ctx.drawImage(base, 0, 0);
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

// The crop drag is not a shape, it only ever exists as the draft. Dimming
// everything outside the box rather than outlining it, so what the drag is
// about to keep is the part that still looks like the screenshot.
function drawCrop(s) {
  const b = bounds(s);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, canvas.width, b.y1);
  ctx.fillRect(0, b.y2, canvas.width, canvas.height - b.y2);
  ctx.fillRect(0, b.y1, b.x1, b.y2 - b.y1);
  ctx.fillRect(b.x2, b.y1, canvas.width - b.x2, b.y2 - b.y1);

  ctx.strokeStyle = '#4da3ff';
  ctx.lineWidth = Math.max(1, unit);
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  ctx.restore();
}

function drawShape(s) {
  if (s.type === 'crop') {
    drawCrop(s);
    return;
  }

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

function snapshot() {
  return {
    shapes: shapes.map((shape) => ({ ...shape })),
    base,
    width: canvas.width,
    height: canvas.height,
  };
}

// Called before the change it undoes, never after. Any new change kills the
// redo stack, the same as in any editor.
function commit() {
  past.push(snapshot());
  future.length = 0;
}

function restore(entry) {
  shapes.length = 0;
  for (const shape of entry.shapes) shapes.push(shape);
  base = entry.base;
  canvas.width = entry.width;
  canvas.height = entry.height;
  measureUnit();
  dropPointers();
  redraw();
}

// Everything holding a shape object that is about to leave the document. Both
// callers can fire in the middle of a drag, since a keystroke does not wait for
// the mouse button, and the next mousemove would otherwise write through a
// selection that is gone.
function dropPointers() {
  selected = null;
  dragFrom = null;
  resizing = null;
  draft = null;
  pendingCommit = false;
}

function push(shape) {
  commit();
  shapes.push(shape);
  redraw();
}

// Renumbering is what keeps the badges 1..n after one is taken out of the
// middle, which is also what nextNumber needs to stay correct.
function deleteSelected() {
  const index = shapes.indexOf(selected);
  if (index < 0) return;
  commit();
  shapes.splice(index, 1);
  renumber(shapes);
  dropPointers();
  redraw();
}

// Crop swaps in a smaller base and pulls every shape back by the same offset,
// so an annotation stays over the pixels it was drawn on. Both go into one
// history entry, which is what makes a crop undoable at all.
function applyCrop(box) {
  const rect = cropRect(box.x1, box.y1, box.x2, box.y2, canvas.width, canvas.height);
  if (!rect) {
    redraw();
    return;
  }

  commit();
  const cropped = document.createElement('canvas');
  cropped.width = rect.width;
  cropped.height = rect.height;
  cropped
    .getContext('2d')
    .drawImage(base, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  base = cropped;
  canvas.width = rect.width;
  canvas.height = rect.height;
  for (const shape of shapes) moveShape(shape, -rect.x, -rect.y);

  // A shape the crop cut away entirely has to leave the document, not just the
  // view. Left in, it is invisible and unclickable but nextNumber still counts
  // it, so the badges stop being the 1..n run that renumber exists to keep and
  // the next badge comes out with a number nothing on screen uses.
  const kept = shapes.filter((shape) => overlaps(shape, rect.width, rect.height));
  shapes.length = 0;
  for (const shape of kept) shapes.push(shape);
  renumber(shapes);

  measureUnit();
  // One crop per trip to the tool. Staying on it would invite a second drag
  // over an image that is already the size the first drag asked for.
  selectTool('select');
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
    if (resizing) {
      pendingCommit = true;
      return;
    }

    // A generous pad, because a thin line is hard to land on exactly.
    selected = hitTest(shapes, point.x, point.y, 6 * unit);
    dragFrom = selected ? point : null;
    pendingCommit = selected !== null;
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
    startChange();
    // Text and badges have no corner to write, so their one grip scales the
    // whole shape about its centre instead. Shift has nothing to square there.
    if (resizing.scale) {
      scaleShape(selected, scaleFactorAt(selected, point.x, point.y));
      redraw();
      return;
    }

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

  if (dragFrom) {
    startChange();
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

// The first mousemove of a drag, where the click is finally known to be a
// change. Recording the document on mousedown instead would leave an entry
// behind every click that only selected something.
function startChange() {
  if (!pendingCommit) return;
  pendingCommit = false;
  commit();
}

window.addEventListener('mouseup', () => {
  dragFrom = null;
  resizing = null;
  pendingCommit = false;
  if (!draft) return;
  const shape = draft;
  draft = null;
  if (shape.type === 'crop') {
    applyCrop(shape);
    return;
  }
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
    const from = event.shiftKey ? future : past;
    const to = event.shiftKey ? past : future;
    const entry = from.pop();
    if (!entry) return;
    // Where the document is now becomes the entry to come back to.
    to.push(snapshot());
    restore(entry);
    return;
  }

  // Otherwise typing a minus into the size box would shrink the selected shape,
  // and Backspace in the text input would delete the shape behind it.
  const typing = event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT';
  if (!selected || typing) return;
  if (event.key === 'Escape') {
    selected = null;
    redraw();
    return;
  }
  // Both keys, because which one deletes forward is a habit that differs by
  // keyboard and neither is worth being wrong about. The guard above is what
  // keeps Backspace usable for editing text in the toolbar boxes.
  if (deleteKeys && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    deleteSelected();
    return;
  }
  const factor = SCALE_KEYS[event.key];
  if (!factor) return;
  event.preventDefault();
  // One entry per tap. Holding the key down fills the history, which is a
  // fair trade for every step being reachable again.
  commit();
  scaleShape(selected, factor);
  redraw();
});

function selectTool(name) {
  tool = name;
  canvas.style.cursor = name === 'select' ? 'default' : 'crosshair';
  if (name !== 'select') selected = null;
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.classList.toggle('active', button.dataset.tool === name);
  }
}

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    selectTool(button.dataset.tool);
    redraw();
  });
}

// The dashed outline lives on the canvas, so it has to go before the export.
function exportPng() {
  selected = null;
  redraw();
  return canvas.toDataURL('image/png');
}

document.getElementById('save').addEventListener('click', () => {
  window.api.saveEditor(exportPng());
});

// Save as picks the name and the folder instead of generating both. Main owns
// the dialog, so the window stays open when it is cancelled.
document.getElementById('save-as').addEventListener('click', () => {
  window.api.saveEditorAs(exportPng());
});

document.getElementById('close').addEventListener('click', () => window.api.closeEditor());

// The canvas scales with the window, so the ratio behind stroke width has to
// follow it. Existing shapes keep the width they were drawn with.
window.addEventListener('resize', measureUnit);
