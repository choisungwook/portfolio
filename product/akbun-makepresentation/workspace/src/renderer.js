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
  showGuidelines: false,
  cropping: null,
  zoom: L.ZOOM_FIT,
};

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const stageInner = $('stage-inner');
const textEditor = $('text-editor');
const present = $('present');
const contextMenu = $('context-menu');
const fontPicker = $('font-picker');
const fontMenu = $('font-menu');
const fontSearch = $('font-search');
const fontOptions = $('font-options');
let fontFamilies = ['Arial', 'Helvetica'];

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

function editorHasFocus() {
  const active = document.activeElement;
  return $('stage').contains(active) || $('props').contains(active);
}

// --- rendering ---------------------------------------------------------------

// The selection overlay shares the slide SVG viewBox. Keep its geometry in
// slide units rather than CSS pixels so the browser scales handles with the
// slide at every zoom level.
const HANDLE_SLIDE_UNITS = 12;

// A fatter twin that follows the shape's own geometry. As `hit` it is
// invisible and makes a hairline as easy to click as a slab; as `halo` it is
// the glow that marks the shape selected. One geometry, so the thing that
// lights up is exactly the thing the pointer answers to.
//
// Text is caught by its filled box and everything else by a wide stroke, so
// the class carries `fill` to tell the two paints apart in css.
function outlineSvg(shape, kind) {
  const width = Math.max(16, shape.strokeWidth + 12);
  const b = L.shapeBBox(shape);
  const attrs = `class="${kind}" stroke-width="${width}"`;
  // The same rotation the visible shape gets. Without it a rotated shape
  // answers the pointer in one place and lights up in another, and only the
  // glow makes that visible.
  return L.rotateSvg(shape, (() => {
    switch (shape.kind) {
      case 'line':
      case 'arrow':
        return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.w}" y2="${shape.y + shape.h}" ${attrs}/>`;
      case 'pen': {
        const pts = shape.points.map((p) => `${p[0]},${p[1]}`).join(' ');
        return `<polyline points="${pts}" ${attrs}/>`;
      }
      case 'ellipse': {
        const rx = b.w / 2;
        const ry = b.h / 2;
        return `<ellipse cx="${b.x + rx}" cy="${b.y + ry}" rx="${rx}" ry="${ry}" ${attrs}/>`;
      }
      case 'text':
        return `<rect x="${b.x}" y="${b.y}" width="${Math.max(b.w, 20)}" height="${Math.max(b.h, shape.fontSize * 1.3)}" class="${kind} fill"/>`;
      default:
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ${attrs}/>`;
    }
  })());
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
        `<rect x="${h.x - HANDLE_SLIDE_UNITS / 2}" y="${h.y - HANDLE_SLIDE_UNITS / 2}" width="${HANDLE_SLIDE_UNITS}" height="${HANDLE_SLIDE_UNITS}" class="sel-handle" data-handle="${h.id}"/>`
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

function guidelinesSvg() {
  if (!state.showGuidelines) return '';
  return (
    '<g class="guidelines" aria-hidden="true">' +
    '<rect x="64" y="48" width="1152" height="112"/>' +
    '<text x="76" y="72">TITLE</text>' +
    '<rect x="64" y="192" width="1152" height="464"/>' +
    '<text x="76" y="216">CONTENT</text>' +
    '</g>'
  );
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
        })}${outlineSvg(shape, 'hit')}</g>`
    )
    .join('');
  const showHandles = state.selection.length === 1 && state.editingIndex < 0;
  const selected = state.selection.map((index) => slide().shapes[index]).filter(Boolean);
  // The glow draws before the shapes so it reads as a backlight. Over them it
  // would tint a black line towards the accent and change the colour the user
  // picked.
  const halos = state.editingIndex < 0
    ? selected.map((shape) => outlineSvg(shape, 'halo')).join('')
    : '';
  const selections = selected.map((shape) => selectionSvg(shape, showHandles)).join('');
  canvas.innerHTML =
    halos +
    shapes +
    slideNumberSvg(state.current) +
    guidelinesSvg() +
    (state.editingIndex < 0 ? selections : '') +
    marqueeSvg() +
    (state.cropping ? cropOverlaySvg() : '');
}

function cropOverlaySvg() {
  const shape = selectedShape();
  if (!shape || shape.kind !== 'image') return '';
  const left = shape.cropLeft || 0;
  const top = shape.cropTop || 0;
  const right = shape.cropRight || 0;
  const bottom = shape.cropBottom || 0;
  const x = shape.x + shape.w * left;
  const y = shape.y + shape.h * top;
  const w = shape.w * (1 - left - right);
  const h = shape.h * (1 - top - bottom);
  const handles = [
    ['left', x, y + h / 2], ['right', x + w, y + h / 2],
    ['top', x + w / 2, y], ['bottom', x + w / 2, y + h],
  ].map(([side, hx, hy]) =>
    `<rect x="${hx - 6}" y="${hy - 6}" width="12" height="12" class="crop-handle" data-crop-handle="${side}"/>`
  ).join('');
  const shades = [
    [shape.x, shape.y, x - shape.x, shape.h],
    [x + w, shape.y, shape.x + shape.w - (x + w), shape.h],
    [x, shape.y, w, y - shape.y],
    [x, y + h, w, shape.y + shape.h - (y + h)],
  ].map(([sx, sy, sw, sh]) =>
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" class="crop-shade"/>`
  ).join('');
  return `<g class="crop-overlay">${shades}<rect x="${x}" y="${y}" width="${w}" height="${h}" class="crop-window"/>${handles}</g>`;
}

function renderThumbs() {
  const thumbs = $('thumbs');
  // The panel takes focus so Backspace can mean "delete this slide" there and
  // keep meaning "delete this object" on the canvas.
  const focused = document.activeElement && thumbs.contains(document.activeElement);
  thumbs.innerHTML = state.deck.slides
    .map(
      (s, i) =>
        `<div class="thumb${i === state.current ? ' active' : ''}" data-slide="${i}" draggable="true" tabindex="${i === state.current ? '0' : '-1'}">` +
        `${L.renderSlideSvg(s, { number: state.showNumbers ? i + 1 : 0 })}` +
        `<span class="num">${i + 1}</span></div>`
    )
    .join('');
  // innerHTML threw away the element that had focus, so hand it back to the
  // thumb that replaced it. Without this a Cmd+Arrow reorder moves focus to
  // the body and the next press does nothing.
  if (focused) thumbs.querySelector(`[data-slide="${state.current}"]`)?.focus();
}

function renderProps() {
  const shape = selectedShape();
  const source = shape || state.defaults;
  const kind = shape ? shape.kind : 'defaults';

  const showFill = kind === 'rect' || kind === 'ellipse' || kind === 'defaults';
  const showStroke = kind !== 'text';
  const showText = kind === 'text' || L.TEXTUAL.has(kind) || kind === 'defaults';

  $('props-fill').hidden = !showFill;
  $('props-stroke').hidden = !showStroke;
  $('props-text').hidden = !showText;
  $('props-arrow-ends').hidden = !(kind === 'line' || kind === 'arrow');
  $('prop-arrow-start').value = L.ARROW_ENDS.includes(source.arrowStart) ? source.arrowStart : 'none';
  $('prop-arrow-end').value = L.ARROW_ENDS.includes(source.arrowEnd) ? source.arrowEnd : 'none';
  $('btn-delete-shape').hidden = !shape;
  $('btn-group').hidden = state.selection.length < 2;
  $('btn-ungroup').hidden = !state.selection.some((index) => slide().shapes[index]?.groupId);
  $('props-pen-arrow').hidden = kind !== 'pen';
  $('props-image-crop').hidden = kind !== 'image';
  $('btn-crop').classList.toggle('active', !!state.cropping);
  $('prop-pen-arrow').checked = !!source.penArrow;
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

  const family = source.fontFamily || 'Helvetica';
  rememberFontFamily(family);
  $('font-family-label').textContent = family;
  $('font-family-label').style.fontFamily = `"${family}", sans-serif`;
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
  const handleEl = event.target.closest('[data-handle]');
  const cropHandle = event.target.closest('[data-crop-handle]');
  const group = event.target.closest('g[data-i]');
  const hitShape = group ? slide().shapes[Number(group.dataset.i)] : null;
  if (state.editingIndex >= 0) textEditor.blur();
  // WebKit otherwise starts a native text selection alongside marquee and
  // Shift-click selection. That highlight can extend outside the marquee and
  // makes the editor selection look as if it contains only the last object.
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  const p = toPoint(event);

  if (state.tool === 'text') {
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

  if (cropHandle && state.cropping && selectedShape()) {
    state.drag = {
      mode: 'crop',
      side: cropHandle.dataset.cropHandle,
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const index = hitShape ? slide().shapes.indexOf(hitShape) : -1;
  const additive = event.shiftKey && !(event.metaKey || event.ctrlKey);
  if (index >= 0) {

    // Opening a text box for editing is decided here rather than from a
    // dblclick event, because the browser never reports one: pointerup
    // redraws the canvas, so mouseup lands on a freshly built element and
    // not the one that took mousedown, and a click needs both.
    //
    // preventDefault keeps the focus the overlay is about to take. Without
    // it the press moves focus back to the page, and from there Backspace
    // deletes the box being typed into instead of a character.
    if (isSecondPress(index) && canEditText(slide().shapes[index])) {
      event.preventDefault();
      selectOnly(index);
      renderCanvas();
      renderProps();
      startTextEdit(index);
      return;
    }

    // Shift changes this object's membership, but only on a press that never
    // travels. Deciding that on pointerup instead of here is what lets Shift
    // do both jobs at once: a Shift-drag of a selected line moves it on one
    // axis, and a Shift-click of it still drops it out of the selection.
    const wasSelected = state.selection.includes(index);
    if (additive) {
      if (!wasSelected) selectMany([...state.selection, ...L.groupIndicesFor(slide().shapes, index)]);
    } else if (!wasSelected) {
      selectMany(L.groupIndicesFor(slide().shapes, index));
    }

    // Cmd/Ctrl+drag drags a copy and leaves the original where it was, the
    // way PowerPoint does. Add Shift and the copy travels on one axis.
    const duplicated = event.metaKey || event.ctrlKey;
    const originalSelection = [...state.selection];
    if (duplicated) {
      const copies = L.cloneShapes(selectedShapes());
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
      // Only an already-selected object can be dropped by a Shift-click. One
      // that was just added by the same press has to stay.
      toggleIndex: additive && wasSelected ? index : -1,
    };
    canvas.setPointerCapture(event.pointerId);
  } else {
    // Shift over empty space keeps what is selected and adds to it. Clearing
    // instead is what made a missed Shift-click throw the selection away.
    if (!additive) clearSelection();
    state.drag = {
      mode: 'marquee',
      x0: p.x,
      y0: p.y,
      x1: p.x,
      y1: p.y,
      baseSelection: additive ? [...state.selection] : [],
    };
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
    const resize = event.shiftKey ? L.resizeShapeConstrained : L.resizeShape;
    resize(shape, drag.from, drag.handle, dx, dy);
  } else if (drag.mode === 'crop') {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    const fraction = drag.side === 'left' || drag.side === 'right' ? dx / shape.w : dy / shape.h;
    const base = drag.side === 'left' ? drag.from.cropLeft : drag.side === 'right' ? drag.from.cropRight :
      drag.side === 'top' ? drag.from.cropTop : drag.from.cropBottom;
    L.setCrop(shape, drag.side, base + ((drag.side === 'left' || drag.side === 'top') ? fraction : -fraction));
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
    // A press that never travelled is a click on empty space, not an area of
    // no size. Handing it to the touch rule would select whichever unfilled
    // shape the pointer happened to be standing inside, so a click meant to
    // deselect would select instead.
    if (rect.w > 2 || rect.h > 2) {
      selectMany([
        ...drag.baseSelection,
        ...L.shapeIndicesInRect(slide().shapes, rect),
      ]);
    }
  } else if (drag.mode === 'move' && !drag.moved && drag.toggleIndex >= 0) {
    // A Shift-press that never moved: the click half of Shift-click.
    selectMany(L.toggleSelection(state.selection, drag.toggleIndex, slide().shapes.length));
  } else if (drag.mode === 'resize' || drag.mode === 'crop' || drag.moved) {
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
// A text box, and any shape that draws text inside its own outline.
function canEditText(shape) {
  return !!shape && (shape.kind === 'text' || L.TEXTUAL.has(shape.kind));
}

function styleTextEditor(shape) {
  if (!shape) return;
  const scale = canvas.getBoundingClientRect().width / L.SLIDE_W;
  const lines = (shape.text || '').split('\n').length;
  // The same inset the glyphs are drawn at, so text does not jump sideways
  // when editing starts inside a rect or an ellipse.
  const box = L.textBox(shape);
  textEditor.style.left = `${box.x * scale}px`;
  textEditor.style.top = `${box.y * scale}px`;
  textEditor.style.width = `${Math.max(box.w, 120) * scale}px`;
  textEditor.style.height = `${Math.max(box.h, shape.fontSize * 1.3 * lines) * scale}px`;
  textEditor.style.fontSize = `${shape.fontSize * scale}px`;
  textEditor.style.fontFamily = `${shape.fontFamily || 'Helvetica'}, sans-serif`;
  textEditor.style.color = shape.textColor;
  textEditor.style.fontWeight = shape.bold ? '700' : '400';
  textEditor.style.fontStyle = shape.italic ? 'italic' : 'normal';
  textEditor.style.textDecoration = shape.underline ? 'underline' : 'none';
  textEditor.style.textAlign = shape.textAlign || 'left';
}

// `seed` is the character that opened the box by being typed while the shape
// was selected. It is the first thing in the box, not a replacement for what
// is already there.
function startTextEdit(index, seed) {
  const shape = slide().shapes[index];
  state.editingIndex = index;
  renderCanvas();

  textEditor.value = seed ? shape.text + seed : shape.text;
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
  // Emptying a text box removes it, because the box is nothing but its text.
  // Emptying the text in a rect leaves the rect: the outline is the object
  // and the text was only something written on it.
  const removed = text === '' && shape.kind === 'text';
  const changed = !removed && text !== shape.text;

  if (removed) {
    slide().shapes.splice(index, 1);
    clearSelection();
  } else if (changed && L.TEXTUAL.has(shape.kind)) {
    shape.text = text;
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
  if (!fontMenu.hidden && event.key === 'Escape') {
    hideFontMenu();
    event.preventDefault();
    return;
  }
  if (!contextMenu.hidden && event.key === 'Escape') {
    hideContextMenu();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && [...document.querySelectorAll('.menu-panel')].some((panel) => !panel.hidden)) {
    hideMenus();
    event.preventDefault();
    return;
  }
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
    // New and Open used to reach the page as system menu accelerators. With
    // the menus in the window there is no accelerator, so the keys land here.
    if (key === 'n') newDeck();
    else if (key === 'o') openFile();
    else if (key === 's') saveFile(event.shiftKey);
    else if (key === 'z' && event.shiftKey) redo();
    else if (key === 'z') undo();
    else if (key === 'y') redo();
    else if (key === 'c' || key === 'v') return;
    else if (key === 'd') duplicateSelection();
    else if (key === 'arrowup') moveCurrentSlide(state.current - 1);
    else if (key === 'arrowdown') moveCurrentSlide(state.current + 1);
    else if (TEXT_STYLE_KEYS[key]) toggleTextStyle(TEXT_STYLE_KEYS[key]);
    else return;
    event.preventDefault();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (editorHasFocus()) deleteSelectedShape();
    else deleteCurrentSlide();
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
  // Typing over a selected shape starts writing in it, the way it does in
  // PowerPoint. That costs the tool shortcuts while such a shape is selected;
  // Escape drops the selection and gives them back.
  if (
    state.selection.length === 1 &&
    canEditText(selectedShape()) &&
    event.key.length === 1 &&
    event.key !== ' '
  ) {
    event.preventDefault();
    startTextEdit(state.selected, event.key);
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

function insertShapes(shapes, offset) {
  const copies = L.cloneShapes(shapes);
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
  const copiedShapes = L.parseClipboardShapes(encoded);
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

// --- context menu and image export ------------------------------------------

function hideContextMenu() {
  contextMenu.hidden = true;
}

function rememberFontFamily(family) {
  if (!fontFamilies.includes(family)) {
    fontFamilies.push(family);
    fontFamilies.sort((left, right) => left.localeCompare(right));
  }
}

function renderFontOptions() {
  const selected = selectedShape()?.fontFamily || state.defaults.fontFamily;
  const matching = L.filterFonts(fontFamilies, fontSearch.value);
  fontOptions.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const family of matching) {
    const option = document.createElement('button');
    option.type = 'button';
    option.dataset.font = family;
    option.textContent = family;
    option.style.fontFamily = `"${family}", sans-serif`;
    option.classList.toggle('active', family === selected);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(family === selected));
    fragment.append(option);
  }
  if (!matching.length) {
    const empty = document.createElement('p');
    empty.className = 'font-empty';
    empty.textContent = 'No fonts found';
    fragment.append(empty);
  }
  fontOptions.append(fragment);
}

function positionFontMenu() {
  const trigger = $('prop-font-family').getBoundingClientRect();
  const bounds = fontMenu.getBoundingClientRect();
  const left = Math.max(
    4,
    Math.min(trigger.right - bounds.width, window.innerWidth - bounds.width - 4)
  );
  const below = trigger.bottom + 4;
  const top = below + bounds.height <= window.innerHeight
    ? below
    : Math.max(4, trigger.top - bounds.height - 4);
  fontMenu.style.left = `${left}px`;
  fontMenu.style.top = `${top}px`;
}

function showFontMenu() {
  fontMenu.hidden = false;
  $('prop-font-family').setAttribute('aria-expanded', 'true');
  fontSearch.value = '';
  renderFontOptions();
  positionFontMenu();
  fontSearch.focus();
}

function hideFontMenu() {
  fontMenu.hidden = true;
  $('prop-font-family').setAttribute('aria-expanded', 'false');
}

async function loadSystemFonts() {
  try {
    const installed = await window.api.listSystemFonts();
    fontFamilies = [...new Set(installed.filter(
      (font) => typeof font === 'string' && font.trim()
    ))].sort((left, right) => left.localeCompare(right));
    rememberFontFamily(state.defaults.fontFamily);
    renderProps();
  } catch (error) {
    console.error('Cannot load system fonts', error);
  }
}

function showContextMenu(x, y) {
  // Group needs more than one object; ungroup needs one that is in a group.
  // Hiding rather than disabling keeps the menu as short as the moment allows.
  $('context-group').hidden = state.selection.length < 2;
  $('context-ungroup').hidden = !state.selection.some(
    (index) => slide().shapes[index]?.groupId
  );
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  const bounds = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  contextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  $('context-save-image').focus();
}

function contextMenuPoint(event, group) {
  if (event.clientX || event.clientY) {
    return { x: event.clientX, y: event.clientY };
  }
  const bounds = group.getBoundingClientRect();
  return {
    x: bounds.left + Math.min(16, bounds.width / 2),
    y: bounds.top + Math.min(16, bounds.height / 2),
  };
}

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  hideContextMenu();
  if (state.presenting || !(event.target instanceof Element)) return;
  const group = event.target.closest('#canvas [data-i]');
  if (!group) return;
  const point = contextMenuPoint(event, group);
  const index = Number(group.dataset.i);
  if (!state.selection.includes(index)) {
    selectOnly(index);
    renderCanvas();
    renderProps();
  }
  showContextMenu(point.x, point.y);
});

document.addEventListener('pointerdown', (event) => {
  if (!contextMenu.contains(event.target)) hideContextMenu();
  if (!fontPicker.contains(event.target)) hideFontMenu();
  if (!$('menubar').contains(event.target)) hideMenus();
});
window.addEventListener('blur', () => {
  hideContextMenu();
  hideFontMenu();
  hideMenus();
});
window.addEventListener('resize', () => {
  hideContextMenu();
  hideFontMenu();
  hideMenus();
});
$('stage-scroll').addEventListener('scroll', () => {
  hideContextMenu();
  hideFontMenu();
  hideMenus();
});
$('props').addEventListener('scroll', hideFontMenu);

function rasterizeShapes(shapes) {
  return new Promise((resolve, reject) => {
    const imageSvg = L.renderShapesSvg(shapes);
    if (!imageSvg) {
      reject(new Error('no shape selected'));
      return;
    }
    const url = URL.createObjectURL(new Blob([imageSvg.svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.max(
          0.01,
          Math.min(2, 4096 / imageSvg.width, 4096 / imageSvg.height)
        );
        const raster = document.createElement('canvas');
        raster.width = Math.max(1, Math.ceil(imageSvg.width * scale));
        raster.height = Math.max(1, Math.ceil(imageSvg.height * scale));
        const context = raster.getContext('2d');
        if (!context) throw new Error('cannot create image canvas');
        context.drawImage(image, 0, 0, raster.width, raster.height);
        resolve(raster.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot render selected shape'));
    };
    image.src = url;
  });
}

function suggestShapeImageName() {
  if (!state.filePath) return `slide-${state.current + 1}-shape.png`;
  const file = state.filePath.split('/').pop().split('\\').pop();
  const deckName = file.replace(/\.pptx$/i, '');
  return `${deckName}-slide-${state.current + 1}-shape.png`;
}

async function saveSelectionAsImage() {
  hideContextMenu();
  const shapes = selectedShapes().map((shape) => structuredClone(shape));
  if (shapes.length === 0) return;
  const path = await window.api.pickSave(suggestShapeImageName(), 'png');
  if (!path) return;
  try {
    const dataUrl = await rasterizeShapes(shapes);
    await window.api.savePng(path, dataUrl);
    await window.api.message('Image saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Image export failed', kind: 'error' });
  }
}

$('context-save-image').addEventListener('click', saveSelectionAsImage);
$('context-group').addEventListener('click', () => {
  hideContextMenu();
  groupSelection();
});
$('context-ungroup').addEventListener('click', () => {
  hideContextMenu();
  ungroupSelection();
});

$('prop-font-family').addEventListener('click', () => {
  if (fontMenu.hidden) showFontMenu();
  else hideFontMenu();
});
fontSearch.addEventListener('input', renderFontOptions);
fontSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideFontMenu();
    $('prop-font-family').focus();
  } else if (event.key === 'Enter') {
    fontOptions.querySelector('[data-font]')?.click();
  } else if (event.key === 'ArrowDown') {
    fontOptions.querySelector('[data-font]')?.focus();
  }
});
fontOptions.addEventListener('click', (event) => {
  const option = event.target.closest('[data-font]');
  if (!option) return;
  applyProp({ fontFamily: option.dataset.font });
  hideFontMenu();
  $('prop-font-family').focus();
});

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

function groupSelection() {
  if (!L.groupShapes(slide().shapes, state.selection)) return;
  markDirty();
  renderAll();
}

function ungroupSelection() {
  if (!L.ungroupShapes(slide().shapes, state.selection)) return;
  markDirty();
  renderAll();
}

function toggleCrop() {
  const shape = selectedShape();
  if (!shape || shape.kind !== 'image') return;
  state.cropping = state.cropping ? null : { index: state.selected };
  renderAll();
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
$('prop-pen-arrow').addEventListener('change', (e) => applyProp({ penArrow: e.target.checked }));
$('prop-arrow-start').addEventListener('change', (e) => applyProp({ arrowStart: e.target.value }));
$('prop-arrow-end').addEventListener('change', (e) => applyProp({ arrowEnd: e.target.value }));
$('btn-group').addEventListener('click', groupSelection);
$('btn-ungroup').addEventListener('click', ungroupSelection);
$('btn-crop').addEventListener('click', toggleCrop);
$('prop-font-size').addEventListener('input', (e) =>
  applyProp({ fontSize: Math.max(6, Number(e.target.value) || 24) })
);
$('prop-text-color').addEventListener('input', (e) => applyProp({ textColor: e.target.value }));
$('btn-delete-shape').addEventListener('click', deleteSelectedShape);

// --- text formatting -----------------------------------------------------------
//
// Formatting is a property of the whole text box, not of a run inside it, so
// these apply to the selected box, or to the style new boxes start with when
// nothing is selected.

function textStyleTarget() {
  const shape = selectedShape();
  if (shape) return canEditText(shape) ? shape : null;
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
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.focus();
});

$('slides').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, [data-slide]')) return;
  $('slides').focus({ preventScroll: true });
});

$('stage').addEventListener('pointerdown', (event) => {
  if (event.target === textEditor || event.target === canvas || canvas.contains(event.target)) return;
  $('stage').focus({ preventScroll: true });
});

$('props').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, input, select, textarea')) return;
  $('props').focus({ preventScroll: true });
});

// --- slide reorder -------------------------------------------------------
//
// Drag and drop in the panel, and Cmd+Up/Down for the same move from the
// keyboard. Both land in moveSlide, so the two cannot disagree about where a
// slide ends up.

function moveCurrentSlide(to) {
  const at = L.moveSlide(state.deck, state.current, to);
  if (at === state.current) return;
  state.current = at;
  clearSelection();
  markDirty();
  renderAll();
}

let dragSlideFrom = -1;

$('thumbs').addEventListener('dragstart', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  dragSlideFrom = Number(thumb.dataset.slide);
  event.dataTransfer.effectAllowed = 'move';
  // Firefox refuses to start a drag without payload, and the index is already
  // in dragSlideFrom, so this is only there to make the drag legal.
  event.dataTransfer.setData('text/plain', String(dragSlideFrom));
});

$('thumbs').addEventListener('dragover', (event) => {
  if (dragSlideFrom < 0) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const thumb = event.target.closest('[data-slide]');
  for (const element of $('thumbs').querySelectorAll('.thumb')) {
    element.classList.toggle('drop-target', element === thumb);
  }
});

$('thumbs').addEventListener('dragleave', (event) => {
  event.target.closest('[data-slide]')?.classList.remove('drop-target');
});

$('thumbs').addEventListener('drop', (event) => {
  const thumb = event.target.closest('[data-slide]');
  event.preventDefault();
  const from = dragSlideFrom;
  endSlideDrag();
  if (from < 0 || !thumb) return;
  state.current = from;
  moveCurrentSlide(Number(thumb.dataset.slide));
});

function endSlideDrag() {
  dragSlideFrom = -1;
  for (const element of $('thumbs').querySelectorAll('.drop-target')) {
    element.classList.remove('drop-target');
  }
}

$('thumbs').addEventListener('dragend', endSlideDrag);

$('btn-add-slide').addEventListener('click', () => {
  state.current = L.addSlide(state.deck, state.current);
  clearSelection();
  markDirty();
  renderAll();
});

// An empty slide goes without asking; one with work on it does not. Same
// answer whether the delete came from the button or from Backspace in the
// panel.
async function deleteCurrentSlide() {
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
}

$('btn-del-slide').addEventListener('click', deleteCurrentSlide);

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

// Rasterize one slide at 1920x1080, which is enough for PDF pages and PNG
// exports at this slide size.
function rasterizeSlideCanvas(s, number) {
  return new Promise((resolve, reject) => {
    const svg = L.renderSlideSvg(s, { number });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const raster = document.createElement('canvas');
      raster.width = 1920;
      raster.height = 1080;
      const context = raster.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('cannot create slide canvas'));
        return;
      }
      context.drawImage(image, 0, 0, 1920, 1080);
      URL.revokeObjectURL(url);
      resolve(raster);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot render slide'));
    };
    image.src = url;
  });
}

async function rasterizeSlideForPdf(s, number) {
  const raster = await rasterizeSlideCanvas(s, number);
  return { dataUrl: raster.toDataURL('image/jpeg', 0.92), width: 1920, height: 1080 };
}

async function exportPdf() {
  const path = await window.api.pickSave(suggestName('pdf'), 'pdf');
  if (!path) return;
  try {
    const pages = [];
    for (const [i, s] of state.deck.slides.entries()) {
      pages.push(await rasterizeSlideForPdf(s, state.showNumbers ? i + 1 : 0));
    }
    await window.api.exportPdf(path, pages);
    await window.api.message('PDF saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Export failed', kind: 'error' });
  }
}

function suggestSlideImageName() {
  const base = suggestName('pptx').replace(/\.pptx$/i, '');
  return `${base}-slide-${state.current + 1}.png`;
}

async function exportPng() {
  const path = await window.api.pickSave(suggestSlideImageName(), 'png');
  if (!path) return;
  try {
    const raster = await rasterizeSlideCanvas(
      slide(),
      state.showNumbers ? state.current + 1 : 0
    );
    await window.api.savePng(path, raster.toDataURL('image/png'));
    await window.api.message('PNG saved.', { title: 'akbun-makepresentation' });
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

let presentationOwnsFullscreen = false;

async function enterPresent() {
  if (state.presenting) return;
  state.presenting = true;
  state.presentIndex = state.current;
  present.hidden = false;
  renderPresent();
  try {
    await window.api.setFullscreen(true);
    presentationOwnsFullscreen = true;
  } catch (error) {
    state.presenting = false;
    present.hidden = true;
    await window.api.message(String(error), {
      title: 'Cannot start presentation',
      kind: 'error',
    });
  }
}

async function exitPresent(restoreWindow = true) {
  if (!state.presenting) return;
  state.presenting = false;
  present.hidden = true;
  const leaveFullscreen = presentationOwnsFullscreen;
  presentationOwnsFullscreen = false;
  if (restoreWindow && leaveFullscreen) {
    try {
      await window.api.setFullscreen(false);
    } catch (_) {}
  }
}

function presentStep(direction) {
  const next = state.presentIndex + direction;
  if (next < 0 || next >= state.deck.slides.length) return;
  state.presentIndex = next;
  renderPresent();
}

present.addEventListener('click', () => presentStep(1));
window.api.onFullscreenChanged((fullscreen) => {
  if (fullscreen && state.presenting) {
    presentationOwnsFullscreen = true;
  } else if (!fullscreen && state.presenting && presentationOwnsFullscreen) {
    exitPresent(false);
  }
});

window.api.onGuidelinesChanged((enabled) => {
  state.showGuidelines = enabled;
  renderCanvas();
});

// --- toolbar and application menu ------------------------------------------------------------------

// Every menu item, by the data-command in the markup. The keyboard shortcuts
// call the same functions, so a command cannot behave one way from the menu
// and another from the key.
const MENU_COMMANDS = {
  new: newDeck,
  open: openFile,
  save: () => saveFile(false),
  'save-as': () => saveFile(true),
  'export-pdf': exportPdf,
  'export-png': exportPng,
  undo,
  redo,
  duplicate: duplicateSelection,
  delete: deleteSelectedShape,
  group: groupSelection,
  ungroup: ungroupSelection,
  guidelines: toggleGuidelines,
  numbers: toggleNumbers,
  'zoom-in': () => setZoom(L.zoomIn(state.zoom)),
  'zoom-out': () => setZoom(L.zoomOut(state.zoom)),
  'zoom-fit': () => setZoom(L.ZOOM_FIT),
};

// The name is not always ours: this also runs whatever the shell sends over
// the file-command event. A plain lookup would find inherited keys, and
// `constructor` would be called as if it were a command.
function runCommand(command) {
  if (Object.hasOwn(MENU_COMMANDS, command)) MENU_COMMANDS[command]();
}

function hideMenus() {
  for (const panel of document.querySelectorAll('.menu-panel')) panel.hidden = true;
  for (const title of document.querySelectorAll('.menu-title')) {
    title.setAttribute('aria-expanded', 'false');
  }
}

function openMenu(name) {
  hideMenus();
  $('menubar').querySelector(`[data-menu-panel="${name}"]`).hidden = false;
  $('menubar').querySelector(`[data-menu="${name}"]`).setAttribute('aria-expanded', 'true');
  // The two toggles are the only items whose state is worth showing, and it
  // only has to be right at the moment the menu opens.
  $('menubar').querySelector('[data-command="guidelines"]')
    .classList.toggle('checked', state.showGuidelines);
  $('menubar').querySelector('[data-command="numbers"]')
    .classList.toggle('checked', state.showNumbers);
}

$('menubar').addEventListener('click', (event) => {
  const title = event.target.closest('.menu-title');
  if (title) {
    const open = title.getAttribute('aria-expanded') === 'true';
    if (open) hideMenus();
    else openMenu(title.dataset.menu);
    return;
  }
  const item = event.target.closest('[data-command]');
  if (!item) return;
  hideMenus();
  runCommand(item.dataset.command);
});

// Sliding along the bar with one menu already open switches menus, the way a
// menu bar does everywhere else.
$('menubar').addEventListener('pointerover', (event) => {
  const title = event.target.closest('.menu-title');
  if (!title) return;
  const anyOpen = [...document.querySelectorAll('.menu-panel')].some((panel) => !panel.hidden);
  if (anyOpen) openMenu(title.dataset.menu);
});

// The app no longer has a system menu bar, so the events it used to send now
// come from these items. The handler stays for anything the shell still emits.
window.api.onFileCommand(runCommand);
$('btn-present').addEventListener('click', enterPresent);

function setNumbersButton() {
  $('btn-numbers').classList.toggle('active', state.showNumbers);
}

function toggleNumbers() {
  state.showNumbers = !state.showNumbers;
  setNumbersButton();
  renderAll();
}

function toggleGuidelines() {
  state.showGuidelines = !state.showGuidelines;
  renderCanvas();
}

$('btn-numbers').addEventListener('click', toggleNumbers);
$('btn-update').addEventListener('click', () => window.api.checkUpdate());
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

setTool('select');
setZoom(state.zoom);
renderAll();
loadSystemFonts();
