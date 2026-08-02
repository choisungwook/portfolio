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

// What `dragFrom` and `resizing` write to. Usually the selection, but the crop
// box is moved and resized by the same two branches without ever being a shape
// in the document, so the target is named rather than assumed.
let dragTarget = null;

// The crop box, once a drag has put one down. It stays on screen instead of
// cropping immediately, so its corners can be pulled until the framing is
// right; Enter or a double click is what finally cuts the image.
let cropBox = null;

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
  if (cropBox) drawCrop(cropBox);
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

// The crop box is never a shape in the document. Everything outside it is
// dimmed hard rather than outlined, so the part about to be thrown away already
// reads as gone while the corners are still being pulled.
function drawCrop(s) {
  const b = bounds(s);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, b.y1);
  ctx.fillRect(0, b.y2, canvas.width, canvas.height - b.y2);
  ctx.fillRect(0, b.y1, b.x1, b.y2 - b.y1);
  ctx.fillRect(b.x2, b.y1, canvas.width - b.x2, b.y2 - b.y1);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1, unit);
  ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);

  // Thirds, the guide every crop tool draws, faint enough not to be mistaken
  // for something in the picture.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  for (let i = 1; i < 3; i += 1) {
    const x = b.x1 + ((b.x2 - b.x1) * i) / 3;
    const y = b.y1 + ((b.y2 - b.y1) * i) / 3;
    ctx.moveTo(x, b.y1);
    ctx.lineTo(x, b.y2);
    ctx.moveTo(b.x1, y);
    ctx.lineTo(b.x2, y);
  }
  ctx.stroke();

  drawCropCorners(b);
  ctx.restore();
}

// L shaped brackets rather than the round grips a shape gets, because they are
// what the corner of a crop looks like everywhere else and they read as a frame
// instead of as part of the image. The arm is capped at a third of the box so a
// small crop does not end up as four overlapping brackets.
function drawCropCorners(b) {
  const arm = Math.min(22 * unit, (b.x2 - b.x1) / 3, (b.y2 - b.y1) / 3);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, 3 * unit);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const [x, sx] of [[b.x1, 1], [b.x2, -1]]) {
    for (const [y, sy] of [[b.y1, 1], [b.y2, -1]]) {
      ctx.moveTo(x + sx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * arm);
    }
  }
  ctx.stroke();
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
  } else if (s.type === 'pencil') {
    // Every sample the mouse gave, joined. No smoothing: a hand drawn line is
    // meant to look like one, and the samples are close enough that the corners
    // a round join leaves are not visible.
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i += 1) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
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
    // Shallow, except for a pencil stroke's point list. Sharing that array with
    // the live shape would let a later move rewrite the history entry meant to
    // undo it, and the stroke would come back already moved.
    shapes: shapes.map((shape) =>
      shape.points
        ? { ...shape, points: shape.points.map((point) => ({ ...point })) }
        : { ...shape }
    ),
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
  dragTarget = null;
  draft = null;
  pendingCommit = false;
  styleEditing = null;
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
  cropBox = null;
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
      dragTarget = selected;
      pendingCommit = true;
      return;
    }

    // A generous pad, because a thin line is hard to land on exactly.
    selected = hitTest(shapes, point.x, point.y, 6 * unit);
    dragFrom = selected ? point : null;
    dragTarget = selected;
    pendingCommit = selected !== null;
    // A different shape means the boxes describe something else now, and the
    // run of style edits they were collecting into one history entry is over.
    styleEditing = null;
    syncStyleInputs(selected);
    redraw();
    return;
  }
  if (tool === 'crop') {
    // A box that is already down is adjusted rather than replaced, which is the
    // whole point of leaving it on screen: corners resize, inside moves.
    if (cropBox) {
      const grip = handleAt(cropBox, point.x, point.y, GRAB * unit);
      if (grip) {
        resizing = grip;
        dragTarget = cropBox;
        return;
      }
      const b = bounds(cropBox);
      if (point.x >= b.x1 && point.x <= b.x2 && point.y >= b.y1 && point.y <= b.y2) {
        dragFrom = point;
        dragTarget = cropBox;
        return;
      }
      // A drag that starts outside the box is a new framing, not an edit.
      cropBox = null;
    }
    draft = { type: 'crop', x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    return;
  }
  if (tool === 'pencil') {
    draft = { type: 'pencil', points: [point], ...style() };
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
      scaleShape(dragTarget, scaleFactorAt(dragTarget, point.x, point.y));
      redraw();
      return;
    }

    // The corner diagonally across from the grip, which is the one that stays put.
    const anchor = {
      x: dragTarget[resizing.fx === 'x1' ? 'x2' : 'x1'],
      y: dragTarget[resizing.fy === 'y1' ? 'y2' : 'y1'],
    };
    const end = event.shiftKey
      ? constrain(dragTarget.type, anchor.x, anchor.y, point.x, point.y)
      : point;
    dragTarget[resizing.fx] = end.x;
    dragTarget[resizing.fy] = end.y;
    redraw();
    return;
  }

  if (dragFrom) {
    startChange();
    moveShape(dragTarget, point.x - dragFrom.x, point.y - dragFrom.y);
    dragFrom = point;
    redraw();
    return;
  }

  if (!draft) return;
  if (draft.type === 'pencil') {
    draft.points.push(point);
    redraw();
    return;
  }
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
  dragTarget = null;
  pendingCommit = false;
  if (!draft) return;
  const shape = draft;
  draft = null;
  if (shape.type === 'crop') {
    // The box stays put instead of cutting now, so the corners can be pulled
    // first. Nothing is thrown away until Enter or a double click.
    if (cropRect(shape.x1, shape.y1, shape.x2, shape.y2, canvas.width, canvas.height)) {
      cropBox = shape;
    }
    redraw();
    return;
  }
  if (shape.type === 'pencil') {
    // One sample is a click, not a stroke, and would draw nothing.
    if (shape.points.length > 1) push(shape);
    else redraw();
    return;
  }
  // A click with no drag would leave an invisible zero sized shape in the history.
  if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 2) push(shape);
  else redraw();
});

// The second half of the crop: the box has been framed, this takes it.
canvas.addEventListener('dblclick', () => {
  if (cropBox) applyCrop(cropBox);
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

  // Enter used to be the only way in, and clicking away threw the typing out,
  // which is the opposite of what every text tool does. Now a click elsewhere
  // commits and only Escape discards. The flag is what keeps the two paths from
  // both firing, since Escape removes the input and that blurs it.
  let done = false;

  const finish = (keep) => {
    if (done) return;
    done = true;
    if (keep && input.value.trim()) {
      push({ type: 'text', x1: point.x, y1: point.y, text: input.value, ...style() });
    }
    input.remove();
  };

  input.addEventListener('keydown', (keyEvent) => {
    // Otherwise Cmd+Z while typing would undo the drawing behind the input.
    keyEvent.stopPropagation();
    if (keyEvent.key === 'Escape') finish(false);
    if (keyEvent.key === 'Enter') finish(true);
  });

  input.addEventListener('blur', () => finish(true));
}

// The style boxes used to arm the next shape only, so changing the colour of
// something already drawn meant deleting it and drawing it again. They now edit
// the selection as well, which is also why selecting a shape loads them.
const STYLE_EDITS = [
  [colorInput, (s, value) => { s.color = value; }],
  [sizeInput, (s, value) => { if (s.size !== undefined) s.size = Math.max(8, Number(value) || s.size); }],
  [strokeInput, (s, value) => { s.width = Math.max(1, Number(value) || s.width); }],
  [fontSelect, (s, value) => { if (s.font && value) s.font = value; }],
];

// The box whose run of edits already has a history entry. Without it the colour
// picker would push one entry per pixel it is dragged through and undo would
// take a hundred taps to get back. Cleared when focus leaves the box or the
// selection changes, so each visit to a box is one undoable step.
let styleEditing = null;

for (const [input, apply] of STYLE_EDITS) {
  input.addEventListener('input', () => {
    if (!selected) return;
    if (styleEditing !== input) {
      commit();
      styleEditing = input;
    }
    apply(selected, input.value);
    redraw();
  });
  input.addEventListener('blur', () => {
    if (styleEditing === input) styleEditing = null;
  });
}

// Selecting a shape loads the boxes from it. Otherwise the first nudge of the
// size box would jump a 60px caption to whatever the box happened to be left
// on. A font the picker does not list is left alone rather than blanked.
function syncStyleInputs(s) {
  if (!s) return;
  if (s.color) colorInput.value = s.color;
  if (s.size !== undefined) sizeInput.value = Math.round(s.size);
  if (s.width !== undefined) strokeInput.value = Math.round(s.width);
  if (s.font && [...fontSelect.options].some((option) => option.value === s.font)) {
    fontSelect.value = s.font;
  }
}

// Resizing an existing shape. Two keys rather than a box, since the shape is
// already selected and one tap per step is faster than typing a number. Two and
// only two, so the toolbar hint can name every key that does this.
const SCALE_KEYS = { '[': 1 / 1.1, ']': 1.1 };

window.addEventListener('keydown', (event) => {
  // Before the toolbar box guard below: Cmd+S means save wherever the caret is,
  // and no box on this toolbar has its own use for it. A held key repeats, and
  // each repeat would export the canvas again and post another save before the
  // first one has closed the window, so only the first keydown counts.
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (event.repeat) return;
    window.api.saveEditor(exportPng());
    return;
  }

  // A key typed into a toolbar box belongs to the box, and that has to be
  // decided before undo rather than after it. Otherwise Cmd+Z while correcting
  // a font size undoes the drawing behind the box instead of the digit just
  // typed. The same guard stops a minus from shrinking the selected shape and
  // Backspace from deleting it.
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;

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

  // The crop box is not a shape, so it needs its own two keys: one to take the
  // framing and one to drop it. Checked before the selection, since a crop in
  // progress is what Escape should be cancelling.
  if (cropBox) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCrop(cropBox);
      return;
    }
    if (event.key === 'Escape') {
      cropBox = null;
      dropPointers();
      redraw();
      return;
    }
  }

  if (!selected) return;
  if (event.key === 'Escape') {
    // Not just the selection. Escape can land with the mouse still down, and
    // the drag would then run on with nothing to write to.
    dropPointers();
    redraw();
    return;
  }
  // Both keys, because which one deletes forward is a habit that differs by
  // keyboard and neither is worth being wrong about. The guard at the top is
  // what keeps Backspace usable for editing the toolbar boxes.
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
  // Leaving the crop tool abandons an unapplied box rather than carrying it
  // over as an overlay no other tool can act on.
  if (name !== 'crop') cropBox = null;
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
  // A framed but unapplied crop is on the canvas too, and the dimming would be
  // saved into the png. Taking the framing is what the screen is promising, so
  // saving with a box up crops rather than throwing the box away.
  if (cropBox) applyCrop(cropBox);
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

// Copy takes the annotated image to the clipboard and closes the editor, the
// same ending Save has. Both are a way of being done with the image, and an
// editor left open after one would be a window with nothing left to do.
document.getElementById('copy').addEventListener('click', () => {
  window.api.copyEditor(exportPng());
});

document.getElementById('close').addEventListener('click', () => window.api.closeEditor());

// The canvas scales with the window, so the ratio behind stroke width has to
// follow it. Existing shapes keep the width they were drawn with.
window.addEventListener('resize', measureUnit);
