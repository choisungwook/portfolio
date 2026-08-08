'use strict';

// Everything that touches the DOM: the canvas, the slide panel, the property
// panel, text editing, and presentation mode. Model math lives in editor.js.

const L = globalThis.slidesLib;

const state = {
  deck: L.createDeck(),
  current: 0,
  selected: -1,
  selection: [],
  tool: 'select',
  filePath: null,
  dirty: false,
  defaults: Object.assign({}, L.DEFAULT_STYLE),
  drag: null,
  editingIndex: -1,
  presenting: false,
  presentIndex: 0,
  showNumbers: false,
  zoom: L.ZOOM_FIT,
};

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const stageInner = $('stage-inner');
const textEditor = $('text-editor');
const present = $('present');

const slide = () => state.deck.slides[state.current];
const selectedShape = () =>
  state.selected >= 0 ? slide().shapes[state.selected] : null;
const selectedShapes = () =>
  state.selection
    .filter((index) => index >= 0 && index < slide().shapes.length)
    .map((index) => slide().shapes[index]);

function selectOnly(index) {
  state.selected = index;
  state.selection = index >= 0 ? [index] : [];
}

function selectMany(indices) {
  state.selection = [...new Set(indices)].filter(
    (index) => index >= 0 && index < slide().shapes.length
  );
  state.selected = state.selection.length ? state.selection[state.selection.length - 1] : -1;
}

function clearSelection() {
  selectOnly(-1);
}

// --- rendering ---------------------------------------------------------------

const HANDLE = 12;

function hitSvg(shape) {
  // An invisible, fatter twin so thin strokes are still clickable. Filled
  // interiors are already clickable through the visible element.
  const width = Math.max(16, shape.strokeWidth + 12);
  const b = L.shapeBBox(shape);
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.w}" y2="${shape.y + shape.h}" stroke="transparent" stroke-width="${width}"/>`;
    case 'pen': {
      const pts = shape.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="transparent" stroke-width="${width}"/>`;
    }
    case 'text':
      return `<rect x="${b.x}" y="${b.y}" width="${Math.max(b.w, 20)}" height="${Math.max(b.h, shape.fontSize * 1.3)}" fill="transparent"/>`;
    default:
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="transparent" stroke-width="${width}"/>`;
  }
}

function selectionSvg(shape, handles) {
  const parts = [];
  if (!handles || (shape.kind !== 'line' && shape.kind !== 'arrow')) {
    const b = L.shapeBBox(shape);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="sel-box"/>`
    );
  }
  if (handles) {
    for (const h of L.handlesFor(shape)) {
      parts.push(
        `<rect x="${h.x - HANDLE / 2}" y="${h.y - HANDLE / 2}" width="${HANDLE}" height="${HANDLE}" class="sel-handle" data-handle="${h.id}"/>`
      );
    }
  }
  return parts.join('');
}

function marqueeSvg() {
  const drag = state.drag;
  if (!drag || drag.mode !== 'marquee') return '';
  const rect = L.normalizeRect(drag.x0, drag.y0, drag.x1, drag.y1);
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" class="selection-marquee"/>`;
}

// The slide number is not part of slide().shapes, so it draws after them and
// outside the g[data-i] groups that make shapes selectable.
function slideNumberSvg(index) {
  if (!state.showNumbers) return '';
  return L.renderShapeSvg(L.slideNumberShape(index + 1));
}

function renderCanvas() {
  // The slide's own color, not the app theme: what the editor shows here is
  // what the pdf and the projector show.
  canvas.style.background = L.slideBackground(slide());
  const shapes = slide()
    .shapes.map(
      (shape, i) =>
        `<g data-i="${i}">${L.renderShapeSvg(shape, {
          hideText: i === state.editingIndex,
        })}${hitSvg(shape)}</g>`
    )
    .join('');
  const showHandles = state.selection.length === 1 && state.editingIndex < 0;
  const selections = state.selection
    .map((index) => slide().shapes[index])
    .filter(Boolean)
    .map((shape) => selectionSvg(shape, showHandles))
    .join('');
  canvas.innerHTML =
    shapes +
    slideNumberSvg(state.current) +
    (state.editingIndex < 0 ? selections : '') +
    marqueeSvg();
}

function renderThumbs() {
  $('thumbs').innerHTML = state.deck.slides
    .map(
      (s, i) =>
        `<div class="thumb${i === state.current ? ' active' : ''}" data-slide="${i}">` +
        `${L.renderSlideSvg(s, { number: state.showNumbers ? i + 1 : 0 })}` +
        `<span class="num">${i + 1}</span></div>`
    )
    .join('');
}

function renderProps() {
  const shape = selectedShape();
  const source = shape || state.defaults;
  const kind = shape ? shape.kind : 'defaults';

  const showFill = kind === 'rect' || kind === 'ellipse' || kind === 'defaults';
  const showStroke = kind !== 'text' && kind !== 'image';
  const showText = kind === 'text' || kind === 'defaults';

  $('props-fill').hidden = !showFill;
  $('props-stroke').hidden = !showStroke;
  $('props-text').hidden = !showText;
  $('btn-delete-shape').hidden = !shape;
  $('props-hint').textContent = state.selection.length > 1
    ? `Selected: ${state.selection.length} objects`
    : shape
    ? `Selected: ${kind}`
    : 'No selection — sets style for new shapes';

  $('prop-fill-none').checked = source.fill === 'none';
  $('prop-fill').value = source.fill === 'none' ? '#ffffff' : source.fill;
  $('prop-fill').disabled = source.fill === 'none';
  $('prop-stroke').value = source.stroke === 'none' ? '#1a1a1a' : source.stroke;
  $('prop-width').value = source.strokeWidth;
  $('prop-dash').value = source.dash;
  $('prop-font-size').value = source.fontSize;
  $('prop-text-color').value = source.textColor;
  $('prop-bold').classList.toggle('active', !!source.bold);
  $('prop-italic').classList.toggle('active', !!source.italic);
  $('prop-underline').classList.toggle('active', !!source.underline);
  for (const button of document.querySelectorAll('[data-align]')) {
    button.classList.toggle('active', button.dataset.align === (source.textAlign || 'left'));
  }
  for (const button of document.querySelectorAll('[data-valign]')) {
    button.classList.toggle(
      'active',
      button.dataset.valign === (source.verticalAlign || 'top')
    );
  }

  // A pptx from another editor can name a font this list does not offer.
  // Adding it keeps the select honest instead of silently showing the wrong
  // family.
  const fonts = $('prop-font-family');
  const family = source.fontFamily || 'Helvetica';
  if (!Array.from(fonts.options).some((o) => o.value === family)) {
    fonts.add(new Option(family, family));
  }
  fonts.value = family;
}

function renderBackground() {
  const color = L.slideBackground(slide());
  $('prop-background').value = color;
  for (const button of document.querySelectorAll('[data-bg]')) {
    button.classList.toggle('active', button.dataset.bg.toLowerCase() === color.toLowerCase());
  }
}

function updateTitle() {
  const name = state.filePath
    ? state.filePath.split('/').pop().split('\\').pop()
    : 'Untitled';
  window.api.setTitle(`akbun-makepresentation — ${name}${state.dirty ? ' •' : ''}`);
}

function renderAll() {
  renderCanvas();
  renderThumbs();
  renderProps();
  renderBackground();
  updateTitle();
}

// --- undo history -------------------------------------------------------------
//
// Every mutation already funnels through markDirty, so history hangs off that
// one hook instead of every call site. `committed` is the deck as of the last
// commit, which is exactly what an undo has to restore.
// ponytail: whole-deck snapshots. A slide of shapes is small; switch to diffs
// only if a deck ever gets big enough to feel it.

const HISTORY_LIMIT = 100;
const history = { past: [], future: [] };
let committed = structuredClone(state.deck);

function resetHistory() {
  history.past.length = 0;
  history.future.length = 0;
  committed = structuredClone(state.deck);
}

function markDirty() {
  history.past.push(committed);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
  committed = structuredClone(state.deck);
  state.dirty = true;
  // Some callers redraw only the canvas, so the title dot updates here
  // rather than waiting for the next full render.
  updateTitle();
}

function restore(deck) {
  state.deck = structuredClone(deck);
  state.current = Math.min(state.current, state.deck.slides.length - 1);
  clearSelection();
  state.dirty = true;
  renderAll();
}

function undo() {
  if (history.past.length === 0) return;
  history.future.push(committed);
  committed = history.past.pop();
  restore(committed);
}

function redo() {
  if (history.future.length === 0) return;
  history.past.push(committed);
  committed = history.future.pop();
  restore(committed);
}

// --- tools ---------------------------------------------------------------------

function setTool(tool) {
  state.tool = tool;
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.classList.toggle('active', button.dataset.tool === tool);
  }
  canvas.dataset.tool = tool;
}

// --- pointer interaction --------------------------------------------------------

// Two presses on the same shape inside this window are a double click. The
// value is the platform default a double click is judged by; longer and an
// ordinary pair of clicks starts opening text boxes.
const DOUBLE_PRESS_MS = 400;
let lastPress = { index: -1, time: -Infinity };

function isSecondPress(index) {
  const now = performance.now();
  const again = index === lastPress.index && now - lastPress.time < DOUBLE_PRESS_MS;
  // A consumed pair ends the sequence, the way a triple click is not two
  // double clicks. Without the reset the press after one counts as a second
  // press again, and a plain click keeps reopening the box just closed.
  lastPress = { index: again ? -1 : index, time: now };
  return again;
}

function toPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (L.SLIDE_W / rect.width),
    y: (event.clientY - rect.top) * (L.SLIDE_H / rect.height),
  };
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const p = toPoint(event);

  if (state.tool === 'text') {
    // Without this the default focus action of the click lands after
    // startTextEdit and blurs the textarea straight back to an empty commit.
    event.preventDefault();
    const shape = L.createShape('text', p.x, p.y, state.defaults);
    shape.w = 320;
    shape.h = shape.fontSize * 1.4;
    slide().shapes.push(shape);
    selectOnly(slide().shapes.length - 1);
    setTool('select');
    markDirty();
    renderAll();
    startTextEdit(state.selected);
    return;
  }

  if (state.tool !== 'select') {
    const shape = L.createShape(state.tool, p.x, p.y, state.defaults);
    slide().shapes.push(shape);
    state.drag = { mode: 'draw', x0: p.x, y0: p.y, index: slide().shapes.length - 1 };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const handleEl = event.target.closest('[data-handle]');
  if (handleEl && state.selection.length === 1 && selectedShape()) {
    state.drag = {
      mode: 'resize',
      handle: handleEl.dataset.handle,
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const group = event.target.closest('g[data-i]');
  if (group) {
    const index = Number(group.dataset.i);

    // Opening a text box for editing is decided here rather than from a
    // dblclick event, because the browser never reports one: pointerup
    // redraws the canvas, so mouseup lands on a freshly built element and
    // not the one that took mousedown, and a click needs both.
    //
    // preventDefault keeps the focus the overlay is about to take. Without
    // it the press moves focus back to the page, and from there Backspace
    // deletes the box being typed into instead of a character.
    if (isSecondPress(index) && slide().shapes[index].kind === 'text') {
      event.preventDefault();
      selectOnly(index);
      renderCanvas();
      renderProps();
      startTextEdit(index);
      return;
    }

    if (!state.selection.includes(index)) selectOnly(index);

    // Cmd/Ctrl+drag drags a copy and leaves the original where it was, the
    // way PowerPoint does. Add Shift and the copy travels on one axis.
    const duplicated = event.metaKey || event.ctrlKey;
    const originalSelection = [...state.selection];
    if (duplicated) {
      const copies = selectedShapes().map((shape) => structuredClone(shape));
      const first = slide().shapes.length;
      slide().shapes.push(...copies);
      selectMany(copies.map((_, offset) => first + offset));
    }
    state.drag = {
      mode: 'move',
      items: state.selection.map((selectedIndex) => ({
        index: selectedIndex,
        from: structuredClone(slide().shapes[selectedIndex]),
      })),
      x0: p.x,
      y0: p.y,
      moved: false,
      duplicated,
      originalSelection,
    };
    canvas.setPointerCapture(event.pointerId);
  } else {
    clearSelection();
    state.drag = { mode: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    canvas.setPointerCapture(event.pointerId);
  }
  renderCanvas();
  renderProps();
});

canvas.addEventListener('pointermove', (event) => {
  const drag = state.drag;
  if (!drag) return;
  const p = toPoint(event);
  const dx = p.x - drag.x0;
  const dy = p.y - drag.y0;

  if (drag.mode === 'draw') {
    L.dragShape(slide().shapes[drag.index], drag.x0, drag.y0, p.x, p.y, event.shiftKey);
  } else if (drag.mode === 'marquee') {
    drag.x1 = p.x;
    drag.y1 = p.y;
  } else if (drag.mode === 'resize') {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    L.resizeShape(shape, drag.from, drag.handle, dx, dy);
  } else if (drag.mode === 'move') {
    // Shift keeps the move on whichever axis has travelled further.
    const straight = event.shiftKey;
    const mx = straight && Math.abs(dx) <= Math.abs(dy) ? 0 : dx;
    const my = straight && Math.abs(dx) > Math.abs(dy) ? 0 : dy;
    for (const item of drag.items) {
      const shape = slide().shapes[item.index];
      Object.assign(shape, structuredClone(item.from));
      L.moveShape(shape, mx, my);
    }
    drag.moved = drag.moved || mx !== 0 || my !== 0;
  }
  renderCanvas();
});

canvas.addEventListener('pointerup', () => {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;

  if (drag.mode === 'draw') {
    const shapes = slide().shapes;
    if (L.isDegenerate(shapes[drag.index])) {
      shapes.splice(drag.index, 1);
    } else {
      selectOnly(drag.index);
      markDirty();
    }
    setTool('select');
  } else if (drag.mode === 'marquee') {
    const rect = L.normalizeRect(drag.x0, drag.y0, drag.x1, drag.y1);
    selectMany(L.shapeIndicesInRect(slide().shapes, rect));
  } else if (drag.mode === 'resize' || drag.moved) {
    markDirty();
  } else if (drag.duplicated) {
    // A Cmd+click that never moved keeps the original selection. The copies
    // made on pointerdown have nowhere useful to sit on top of the originals.
    slide().shapes.splice(slide().shapes.length - drag.items.length, drag.items.length);
    selectMany(drag.originalSelection);
  }
  renderAll();
});


// --- text editing -----------------------------------------------------------------

// The overlay has to look like the glyphs it hides, or every text box jumps
// the moment editing starts or ends. A missing shape means the box being
// edited is already gone, the same case commitTextEdit guards against.
function styleTextEditor(shape) {
  if (!shape) return;
  const scale = canvas.getBoundingClientRect().width / L.SLIDE_W;
  const lines = (shape.text || '').split('\n').length;
  textEditor.style.left = `${shape.x * scale}px`;
  textEditor.style.top = `${shape.y * scale}px`;
  textEditor.style.width = `${Math.max(shape.w, 120) * scale}px`;
  textEditor.style.height = `${Math.max(shape.h, shape.fontSize * 1.3 * lines) * scale}px`;
  textEditor.style.fontSize = `${shape.fontSize * scale}px`;
  textEditor.style.fontFamily = `${shape.fontFamily || 'Helvetica'}, sans-serif`;
  textEditor.style.color = shape.textColor;
  textEditor.style.fontWeight = shape.bold ? '700' : '400';
  textEditor.style.fontStyle = shape.italic ? 'italic' : 'normal';
  textEditor.style.textDecoration = shape.underline ? 'underline' : 'none';
  textEditor.style.textAlign = shape.textAlign || 'left';
}

function startTextEdit(index) {
  const shape = slide().shapes[index];
  state.editingIndex = index;
  renderCanvas();

  textEditor.value = shape.text;
  styleTextEditor(shape);
  textEditor.hidden = false;
  // Deferred so it wins over whatever focus change the triggering click
  // still has queued.
  setTimeout(() => {
    textEditor.focus();
    textEditor.setSelectionRange(textEditor.value.length, textEditor.value.length);
  }, 0);
}

function commitTextEdit() {
  if (state.editingIndex < 0) return;
  const index = state.editingIndex;
  const shape = slide().shapes[index];
  state.editingIndex = -1;
  textEditor.hidden = true;

  // The shape can be gone by now: an undo, or a delete that reached the page
  // while the overlay was open. There is nothing to commit into, and reading
  // through it would take the whole page down.
  if (!shape) {
    clearSelection();
    renderAll();
    return;
  }

  // Both answers are needed before the shape is touched. Asking afterwards
  // compares the new text with itself, which is never a change, and then an
  // edit reaches neither the undo history nor the dirty marker.
  const text = textEditor.value.replace(/\s+$/, '');
  const removed = text === '';
  const changed = !removed && text !== shape.text;

  if (removed) {
    slide().shapes.splice(index, 1);
    clearSelection();
  } else if (changed) {
    shape.text = text;
    const lines = text.split('\n').length;
    shape.h = Math.max(shape.h, lines * shape.fontSize * 1.35);
  }
  if (removed || changed) markDirty();
  renderAll();
}

textEditor.addEventListener('blur', commitTextEdit);
textEditor.addEventListener('keydown', (event) => {
  // The document handler must not see plain typing: every letter is a tool
  // shortcut out there. Formatting and zoom are the exceptions, handled here
  // so Cmd+B works mid-sentence like it does in any other editor.
  event.stopPropagation();
  if (event.key === 'Escape') {
    textEditor.blur();
    return;
  }
  if (!(event.metaKey || event.ctrlKey)) return;
  const style = TEXT_STYLE_KEYS[event.key.toLowerCase()];
  if (style) {
    toggleTextStyle(style);
    event.preventDefault();
  } else if (handleZoomKey(event.key)) {
    event.preventDefault();
  }
});

// --- keyboard ------------------------------------------------------------------------

const TOOL_KEYS = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', p: 'pen', t: 'text' };

document.addEventListener('keydown', (event) => {
  if (state.presenting) {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') presentStep(1);
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') presentStep(-1);
    else if (event.key === 'Escape') exitPresent();
    event.preventDefault();
    return;
  }

  // A text box open for editing owns the keyboard, and its own handler below
  // deals with every key it should answer. Reaching here at all means focus
  // slipped off the overlay; without this the shortcuts would run against the
  // box being typed into — Backspace deleting it, a letter switching tools.
  if (state.editingIndex >= 0 && event.target !== textEditor) {
    textEditor.focus();
    event.preventDefault();
    return;
  }

  // Zoom answers even while a field has focus: it is about the view, not
  // about whatever is being typed into.
  if ((event.metaKey || event.ctrlKey) && handleZoomKey(event.key)) {
    event.preventDefault();
    return;
  }

  const target = event.target;
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
    return;
  }

  // Cmd on macOS, Ctrl elsewhere. event.key is already the unshifted letter
  // for these, so Shift only picks the redo branch.
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    if (key === 's') saveFile(false);
    else if (key === 'z' && event.shiftKey) redo();
    else if (key === 'z') undo();
    else if (key === 'y') redo();
    else if (key === 'c' || key === 'v') return;
    else if (key === 'd') duplicateSelection();
    else if (TEXT_STYLE_KEYS[key]) toggleTextStyle(TEXT_STYLE_KEYS[key]);
    else return;
    event.preventDefault();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    deleteSelectedShape();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape') {
    clearSelection();
    renderCanvas();
    renderProps();
    return;
  }
  if (event.key.startsWith('Arrow')) {
    const shapes = selectedShapes();
    if (shapes.length === 0) return;
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    for (const shape of shapes) L.moveShape(shape, dx, dy);
    markDirty();
    renderCanvas();
    event.preventDefault();
    return;
  }
  const tool = TOOL_KEYS[event.key.toLowerCase()];
  if (tool) setTool(tool);
});

function deleteSelectedShape() {
  if (state.selection.length === 0) return;
  const descending = [...state.selection].sort((a, b) => b - a);
  for (const index of descending) slide().shapes.splice(index, 1);
  clearSelection();
  markDirty();
  renderAll();
}

// --- copy, paste, duplicate ----------------------------------------------------

const PASTE_OFFSET = 20;
const SHAPE_CLIPBOARD_TYPE = 'application/x-akbun-makepresentation-shapes';
const SHAPE_KINDS = new Set(['rect', 'ellipse', 'line', 'arrow', 'pen', 'text', 'image']);

function insertShapes(shapes, offset) {
  const copies = shapes.map((shape) => structuredClone(shape));
  if (offset) {
    for (const copy of copies) L.moveShape(copy, offset, offset);
  }
  const first = slide().shapes.length;
  slide().shapes.push(...copies);
  selectMany(copies.map((_, index) => first + index));
  markDirty();
  renderAll();
  return copies;
}

function isFormField(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

function parseClipboardShapes(value) {
  try {
    const shapes = JSON.parse(value);
    if (!Array.isArray(shapes) || shapes.length === 0) return [];
    return shapes.filter((shape) => shape && SHAPE_KINDS.has(shape.kind));
  } catch (_) {
    return [];
  }
}

document.addEventListener('copy', (event) => {
  if (isFormField(event.target)) return;
  const shapes = selectedShapes();
  if (shapes.length === 0 || !event.clipboardData) return;
  event.clipboardData.setData(SHAPE_CLIPBOARD_TYPE, JSON.stringify(shapes));
  const text = shapes
    .filter((shape) => shape.kind === 'text')
    .map((shape) => shape.text)
    .join('\n');
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
});

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('cannot read clipboard image'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('cannot decode clipboard image'));
    image.src = src;
  });
}

function pastedTextShape(text) {
  const shape = L.createShape('text', 80, 80, state.defaults);
  shape.w = 640;
  shape.text = text.replace(/\r\n/g, '\n');
  const lines = L.wrapTextLines(shape.text, shape.w, shape.fontSize).length;
  shape.h = Math.max(shape.fontSize * 1.4, lines * shape.fontSize * 1.35);
  return shape;
}

async function pastedImageShape(file, index) {
  const src = await readFileDataUrl(file);
  const size = await readImageSize(src);
  const scale = Math.min(1, (L.SLIDE_W * 0.8) / size.width, (L.SLIDE_H * 0.8) / size.height);
  const shape = L.createShape('image', 0, 0, state.defaults);
  shape.w = Math.max(1, size.width * scale);
  shape.h = Math.max(1, size.height * scale);
  shape.x = (L.SLIDE_W - shape.w) / 2 + index * PASTE_OFFSET;
  shape.y = (L.SLIDE_H - shape.h) / 2 + index * PASTE_OFFSET;
  shape.src = src;
  return shape;
}

document.addEventListener('paste', async (event) => {
  if (isFormField(event.target) || !event.clipboardData) return;

  const encoded = event.clipboardData.getData(SHAPE_CLIPBOARD_TYPE);
  const copiedShapes = parseClipboardShapes(encoded);
  if (copiedShapes.length) {
    event.preventDefault();
    insertShapes(copiedShapes, PASTE_OFFSET);
    return;
  }

  const itemFiles = Array.from(event.clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  const directFiles = Array.from(event.clipboardData.files || [])
    .filter((file) => file.type.startsWith('image/'));
  const imageFiles = [...new Set([...itemFiles, ...directFiles])];
  if (imageFiles.length) {
    event.preventDefault();
    try {
      const shapes = await Promise.all(imageFiles.map(pastedImageShape));
      insertShapes(shapes, 0);
    } catch (error) {
      await window.api.message(String(error), { title: 'Cannot paste image', kind: 'error' });
    }
    return;
  }

  const text = event.clipboardData.getData('text/plain');
  if (text) {
    event.preventDefault();
    insertShapes([pastedTextShape(text)], 0);
  }
});

// Cmd+D duplicates the selected shape, or the whole slide when nothing on it
// is selected. Same split PowerPoint makes.
function duplicateSelection() {
  const shapes = selectedShapes();
  if (shapes.length) {
    insertShapes(shapes, PASTE_OFFSET);
    return;
  }
  state.current = L.duplicateSlide(state.deck, state.current);
  markDirty();
  renderAll();
}

// --- property panel -------------------------------------------------------------------

function applyProp(patch) {
  const shapes = selectedShapes();
  if (shapes.length) {
    for (const shape of shapes) Object.assign(shape, patch);
    markDirty();
    renderCanvas();
    renderThumbs();
  } else {
    Object.assign(state.defaults, patch);
  }
  renderProps();
}

// --- slide background --------------------------------------------------------
//
// Deliberately not part of applyProp: it writes to the slide, never to a
// shape or to the defaults for new shapes, whatever happens to be selected.

function setBackground(color, allSlides) {
  const targets = allSlides ? state.deck.slides : [slide()];
  for (const target of targets) target.background = color;
  markDirty();
  renderCanvas();
  renderThumbs();
  renderBackground();
}

$('bg-swatches').addEventListener('click', (event) => {
  const swatch = event.target.closest('[data-bg]');
  if (swatch) setBackground(swatch.dataset.bg, false);
});
$('prop-background').addEventListener('input', (e) => setBackground(e.target.value, false));
$('btn-bg-all').addEventListener('click', () =>
  setBackground(L.slideBackground(slide()), true)
);

// --- zoom ---------------------------------------------------------------------

function setZoom(zoom) {
  state.zoom = zoom;
  stageInner.style.setProperty('--zoom', String(zoom));
  $('btn-zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  // The overlay textarea is placed in screen pixels, so a zoom while a text
  // box is open would leave it behind the glyphs it is meant to cover.
  if (state.editingIndex >= 0) textEditor.blur();
}

$('btn-zoom-in').addEventListener('click', () => setZoom(L.zoomIn(state.zoom)));
$('btn-zoom-out').addEventListener('click', () => setZoom(L.zoomOut(state.zoom)));
$('btn-zoom-level').addEventListener('click', () => setZoom(L.ZOOM_FIT));

// True when the key was a zoom command, so the caller can swallow it. Cmd+=
// rather than Cmd+Shift+= for zooming in, which is the habit everywhere else.
function handleZoomKey(key) {
  if (key === '=' || key === '+') setZoom(L.zoomIn(state.zoom));
  else if (key === '-' || key === '_') setZoom(L.zoomOut(state.zoom));
  else if (key === '0') setZoom(L.ZOOM_FIT);
  else return false;
  return true;
}

// --- shape properties ------------------------------------------------------

$('prop-fill-none').addEventListener('change', (e) =>
  applyProp({ fill: e.target.checked ? 'none' : $('prop-fill').value })
);
$('prop-fill').addEventListener('input', (e) => applyProp({ fill: e.target.value }));
$('prop-stroke').addEventListener('input', (e) => applyProp({ stroke: e.target.value }));
$('prop-width').addEventListener('input', (e) =>
  applyProp({ strokeWidth: Math.max(1, Number(e.target.value) || 1) })
);
$('prop-dash').addEventListener('change', (e) => applyProp({ dash: e.target.value }));
$('prop-font-size').addEventListener('input', (e) =>
  applyProp({ fontSize: Math.max(6, Number(e.target.value) || 24) })
);
$('prop-text-color').addEventListener('input', (e) => applyProp({ textColor: e.target.value }));
$('prop-font-family').addEventListener('change', (e) =>
  applyProp({ fontFamily: e.target.value })
);
$('btn-delete-shape').addEventListener('click', deleteSelectedShape);

// --- text formatting -----------------------------------------------------------
//
// Formatting is a property of the whole text box, not of a run inside it, so
// these apply to the selected box, or to the style new boxes start with when
// nothing is selected.

function textStyleTarget() {
  const shape = selectedShape();
  if (shape) return shape.kind === 'text' ? shape : null;
  return state.defaults;
}

function toggleTextStyle(name) {
  const target = textStyleTarget();
  if (!target) return;
  applyProp({ [name]: !target[name] });
  // A box open for editing shows its glyphs in the textarea, not on the
  // canvas, so the overlay has to be restyled too.
  if (state.editingIndex >= 0) styleTextEditor(slide().shapes[state.editingIndex]);
}

$('prop-bold').addEventListener('click', () => toggleTextStyle('bold'));
$('prop-italic').addEventListener('click', () => toggleTextStyle('italic'));
$('prop-underline').addEventListener('click', () => toggleTextStyle('underline'));

$('prop-align').addEventListener('click', (event) => {
  const button = event.target.closest('[data-align]');
  if (button) applyProp({ textAlign: button.dataset.align });
});

$('prop-vertical-align').addEventListener('click', (event) => {
  const button = event.target.closest('[data-valign]');
  if (button) applyProp({ verticalAlign: button.dataset.valign });
});

const TEXT_STYLE_KEYS = { b: 'bold', i: 'italic', u: 'underline' };

// --- slide panel ------------------------------------------------------------------------

$('thumbs').addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  state.current = Number(thumb.dataset.slide);
  clearSelection();
  renderAll();
});

$('btn-add-slide').addEventListener('click', () => {
  state.current = L.addSlide(state.deck, state.current);
  clearSelection();
  markDirty();
  renderAll();
});

$('btn-del-slide').addEventListener('click', async () => {
  const empty = slide().shapes.length === 0;
  if (!empty) {
    const sure = await window.api.ask(`Delete slide ${state.current + 1}?`, {
      title: 'Delete Slide',
      kind: 'warning',
    });
    if (!sure) return;
  }
  state.current = L.deleteSlide(state.deck, state.current);
  clearSelection();
  markDirty();
  renderAll();
});

// --- file operations -----------------------------------------------------------------------

async function confirmDiscard() {
  if (!state.dirty) return true;
  return window.api.ask('Discard unsaved changes?', {
    title: 'Unsaved changes',
    kind: 'warning',
  });
}

async function newDeck() {
  if (!(await confirmDiscard())) return;
  state.deck = L.createDeck();
  state.current = 0;
  clearSelection();
  state.filePath = null;
  state.dirty = false;
  resetHistory();
  renderAll();
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  const path = await window.api.pickOpen();
  if (!path) return;
  try {
    state.deck = await window.api.openDeck(path);
    state.current = 0;
    clearSelection();
    state.filePath = path;
    state.dirty = false;
    // The number flag has nowhere to live in a .pptx, so an opened file
    // starts with it off; any numbers baked in on save are plain text boxes.
    state.showNumbers = false;
    setNumbersButton();
    resetHistory();
    renderAll();
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot open file', kind: 'error' });
  }
}

function suggestName(extension) {
  if (!state.filePath) return `deck.${extension}`;
  const base = state.filePath.split('/').pop().split('\\').pop();
  return base.replace(/\.pptx$/i, '') + '.' + extension;
}

// pptx has no field for "show slide numbers", so the number goes into the
// file as a real text box on each slide, which is what PowerPoint would show
// anyway.
function deckForSave() {
  if (!state.showNumbers) return state.deck;
  const copy = structuredClone(state.deck);
  copy.slides.forEach((s, i) => s.shapes.push(L.slideNumberShape(i + 1)));
  return copy;
}

async function saveFile(alwaysAsk) {
  let path = state.filePath;
  if (alwaysAsk || !path) {
    path = await window.api.pickSave(suggestName('pptx'), 'pptx');
    if (!path) return;
  }
  try {
    await window.api.saveDeck(path, deckForSave());
    state.filePath = path;
    state.dirty = false;
    updateTitle();
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
  }
}

// Rasterize one slide for the pdf: SVG markup into an image, image onto a
// canvas, canvas to JPEG. 1920x1080 is plenty for print at this slide size.
function rasterizeSlide(s, number) {
  return new Promise((resolve, reject) => {
    const svg = L.renderSlideSvg(s, { number });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const raster = document.createElement('canvas');
      raster.width = 1920;
      raster.height = 1080;
      raster.getContext('2d').drawImage(image, 0, 0, 1920, 1080);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: raster.toDataURL('image/jpeg', 0.92), width: 1920, height: 1080 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot render slide'));
    };
    image.src = url;
  });
}

async function exportPdf() {
  const path = await window.api.pickSave(suggestName('pdf'), 'pdf');
  if (!path) return;
  try {
    const pages = [];
    for (const [i, s] of state.deck.slides.entries()) {
      pages.push(await rasterizeSlide(s, state.showNumbers ? i + 1 : 0));
    }
    await window.api.exportPdf(path, pages);
    await window.api.message('PDF saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Export failed', kind: 'error' });
  }
}

// --- presentation mode ------------------------------------------------------------------------

function renderPresent() {
  present.innerHTML = L.renderSlideSvg(state.deck.slides[state.presentIndex], {
    number: state.showNumbers ? state.presentIndex + 1 : 0,
  });
}

function enterPresent() {
  state.presenting = true;
  state.presentIndex = state.current;
  present.hidden = false;
  renderPresent();
  if (present.requestFullscreen) present.requestFullscreen().catch(() => {});
}

function exitPresent() {
  state.presenting = false;
  present.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function presentStep(direction) {
  const next = state.presentIndex + direction;
  if (next < 0 || next >= state.deck.slides.length) return;
  state.presentIndex = next;
  renderPresent();
}

present.addEventListener('click', () => presentStep(1));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.presenting) exitPresent();
});

// --- toolbar ---------------------------------------------------------------------------------------

$('btn-new').addEventListener('click', newDeck);
$('btn-open').addEventListener('click', openFile);
$('btn-save').addEventListener('click', () => saveFile(false));
$('btn-save-as').addEventListener('click', () => saveFile(true));
$('btn-pdf').addEventListener('click', exportPdf);
$('btn-present').addEventListener('click', enterPresent);

function setNumbersButton() {
  $('btn-numbers').classList.toggle('active', state.showNumbers);
}

$('btn-numbers').addEventListener('click', () => {
  state.showNumbers = !state.showNumbers;
  setNumbersButton();
  renderAll();
});
$('btn-update').addEventListener('click', () => window.api.checkUpdate());
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

setTool('select');
setZoom(state.zoom);
renderAll();
