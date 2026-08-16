'use strict';

// Everything that touches the DOM: the canvas, the slide panel, the property
// panel, text editing, and presentation mode. Model math lives in editor.js.

const L = globalThis.slidesLib;
const S = globalThis.makepresentationSettings;
const AI = globalThis.makepresentationAi;
const AiPanel = globalThis.makepresentationAiPanel;

const state = {
  deck: L.createDeck(),
  current: 0,
  slideSelection: [0],
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
const slideContextMenu = $('slide-context-menu');
const presetMenu = $('preset-menu');
const backgroundMenu = $('background-menu');
const codeBlockMenu = $('code-block-menu');
const codeDialog = $('code-dialog');
const guidelinesDialog = $('guidelines-dialog');
const slideSizeDialog = $('slide-size-dialog');
const settingsDialog = $('settings-dialog');
const fontPicker = $('font-picker');
const fontMenu = $('font-menu');
const fontSearch = $('font-search');
const fontOptions = $('font-options');
let fontFamilies = ['Noto Sans KR', 'Arial', 'Helvetica'];
let textEditBefore = null;
let customPresets = [];
let settingsPresetDraft = [];
let appSettings = S.defaultAppSettings();
let codeEditBefore = null;
let codeEditIndex = -1;
let codeEditIsNew = false;

const slide = () => state.deck.slides[state.current];
const deckSize = () => L.slideSize(state.deck);
const selectedShape = () =>
  state.selected >= 0 ? slide().shapes[state.selected] : null;
const selectedShapes = () =>
  state.selection
    .filter((index) => index >= 0 && index < slide().shapes.length)
    .map((index) => slide().shapes[index]);

function borderStyle(border) {
  return {
    stroke: border.color,
    strokeWidth: border.width,
    dash: border.dash,
  };
}

function syncConfiguredDefaults() {
  Object.assign(state.defaults, {
    ...borderStyle(appSettings.editorDefaults.shapeBorder),
    fontFamily: appSettings.editorDefaults.fontFamily,
  });
}

function newShapeStyle(kind) {
  if (kind === 'image') {
    return {
      ...state.defaults,
      ...borderStyle(appSettings.editorDefaults.imageBorder),
    };
  }
  return state.defaults;
}

function fitTextBoxForSlide(shape, text) {
  const available = deckSize().width - Math.max(0, Number(shape.x) || 0);
  return L.fitTextBox(shape, text, available);
}

function selectOnly(index) {
  if (state.cropping && state.cropping.index !== index) state.cropping = null;
  state.selected = index;
  state.selection = index >= 0 ? [index] : [];
}

function selectMany(indices) {
  const selection = [...new Set(indices)].filter(
    (index) => index >= 0 && index < slide().shapes.length
  );
  if (
    state.cropping &&
    (selection.length !== 1 || selection[0] !== state.cropping.index)
  ) state.cropping = null;
  state.selection = selection;
  state.selected = state.selection.length ? state.selection[state.selection.length - 1] : -1;
}

function clearSelection() {
  selectOnly(-1);
}

function setSlideSelection(indices) {
  state.slideSelection = [...new Set(indices)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < state.deck.slides.length
  );
  if (state.slideSelection.length === 0) state.slideSelection = [state.current];
}

function selectedSlideIndices() {
  return [...state.slideSelection].sort((left, right) => left - right);
}

function slidesHaveFocus() {
  return $('slides').contains(document.activeElement);
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

// The rotate grip: the round handle plus the three-quarter arc rotation
// carries as its icon everywhere else, so it does not read as one more resize
// handle that happens to sit further out.
function rotateHandleSvg(point) {
  const r = HANDLE_SLIDE_UNITS / 2;
  const a = r * 0.55;
  const { x, y } = point;
  return (
    `<g data-handle="rotate" class="rot-handle">` +
    `<circle cx="${x}" cy="${y}" r="${r}"/>` +
    `<path d="M ${x - a} ${y + a * 0.6} A ${a} ${a} 0 1 1 ${x + a} ${y + a * 0.6}" class="rot-glyph"/>` +
    `<path d="M ${x + a * 0.3} ${y + a * 0.5} L ${x + a * 1.6} ${y + a * 0.5} L ${x + a * 0.95} ${y + a * 1.5} Z" class="rot-head"/>` +
    `</g>`
  );
}

// Rotated with the shape, so the box and every grip sit on the outline the
// user can see. Without it a rotated shape lights up in one place and offers
// its handles in another.
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
    const b = L.shapeBBox(shape);
    const grip = L.rotationHandleFor(shape);
    parts.push(
      `<line x1="${b.x + b.w / 2}" y1="${b.y}" x2="${grip.x}" y2="${grip.y}" class="rot-stem"/>`
    );
    parts.push(rotateHandleSvg(grip));
  }
  return L.rotateSvg(shape, parts.join(''));
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
  const { width, height } = deckSize();
  return L.renderShapeSvg(L.slideNumberShape(index + 1, width, height));
}

function guidelinesSvg() {
  if (!state.showGuidelines) return '';
  const { width, height } = deckSize();
  const geometry = S.guidelineGeometry(width, height, appSettings.guidelines);
  return (
    '<g class="guidelines" aria-hidden="true">' +
    `<rect x="${geometry.x}" y="${geometry.titleY}" width="${geometry.width}" height="${geometry.titleHeight}"/>` +
    `<text x="${geometry.x + 12}" y="${geometry.titleY + 24}">TITLE</text>` +
    `<rect x="${geometry.x}" y="${geometry.contentY}" width="${geometry.width}" height="${geometry.contentHeight}"/>` +
    `<text x="${geometry.x + 12}" y="${geometry.contentY + 24}">CONTENT</text>` +
    '</g>'
  );
}

function renderCanvas() {
  const { width, height } = deckSize();
  canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
  stageInner.style.setProperty('--slide-ratio', String(width / height));
  stageInner.style.setProperty('--slide-aspect', `${width} / ${height}`);
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
  const cropOverlay = state.cropping ? cropOverlaySvg() : '';
  canvas.innerHTML =
    halos +
    shapes +
    slideNumberSvg(state.current) +
    guidelinesSvg() +
    cropOverlay +
    (state.editingIndex < 0 ? selections : '') +
    marqueeSvg();
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
  return L.rotateSvg(
    shape,
    `<g class="crop-overlay">${shades}<rect x="${x}" y="${y}" width="${w}" height="${h}" class="crop-window"/>${handles}</g>`
  );
}

function renderThumbs() {
  const thumbs = $('thumbs');
  const { width, height } = deckSize();
  // The panel takes focus so Backspace can mean "delete this slide" there and
  // keep meaning "delete this object" on the canvas.
  const focused = document.activeElement && thumbs.contains(document.activeElement);
  thumbs.innerHTML = state.deck.slides
    .map(
      (s, i) =>
        `<div class="thumb${i === state.current ? ' active' : ''}${state.slideSelection.includes(i) ? ' selected' : ''}" data-slide="${i}" draggable="true" tabindex="${i === state.current ? '0' : '-1'}">` +
        `${L.renderSlideSvg(s, { width, height, number: state.showNumbers ? i + 1 : 0 })}` +
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
  $('props-stroke').hidden = !showStroke || kind === 'code';
  $('props-text').hidden = !showText;
  $('props-code').hidden = kind !== 'code';
  if (kind === 'code') {
    $('props-code-format').textContent = L.CODE_FORMATS[source.codeFormat]?.label || 'Editor Dark';
    $('props-code-language').textContent = source.codeLanguage || 'plaintext';
  }
  // A freehand stroke names its two ends the same way a line does.
  $('props-arrow-ends').hidden = !(kind === 'line' || kind === 'arrow' || kind === 'pen');
  $('prop-arrow-start').value = L.ARROW_ENDS.includes(source.arrowStart) ? source.arrowStart : 'none';
  $('prop-arrow-end').value = L.ARROW_ENDS.includes(source.arrowEnd) ? source.arrowEnd : 'none';
  $('btn-delete-shape').hidden = !shape;
  $('btn-group').hidden = state.selection.length < 2;
  $('btn-ungroup').hidden = !state.selection.some((index) => slide().shapes[index]?.groupId);
  $('props-image-crop').hidden = kind !== 'image';
  $('btn-crop').classList.toggle('active', !!state.cropping);
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

  const family = source.fontFamily || S.DEFAULT_FONT_FAMILY;
  rememberFontFamily(family);
  $('font-family-label').textContent = family;
  $('font-family-label').style.fontFamily = `"${family}", sans-serif`;
}

function renderBackground() {
  const color = L.slideBackground(slide());
  $('prop-background').value = color;
  $('current-background').style.backgroundColor = color;
  $('background-value').textContent = color.toUpperCase();
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
  setSlideSelection([state.current]);
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
  const { width, height } = deckSize();
  return {
    x: (event.clientX - rect.left) * (width / rect.width),
    y: (event.clientY - rect.top) * (height / rect.height),
  };
}

function selectedShapeIndexAtPoint(point) {
  for (const index of [...state.selection].reverse()) {
    const shape = slide().shapes[index];
    if (!canEditText(shape)) continue;
    if (L.shapeSelectionContainsPoint(shape, point.x, point.y)) return index;
  }
  return -1;
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
    const shape = L.createShape('text', p.x, p.y, newShapeStyle('text'));
    shape.w = 120;
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
    const shape = L.createShape(state.tool, p.x, p.y, newShapeStyle(state.tool));
    slide().shapes.push(shape);
    state.drag = { mode: 'draw', x0: p.x, y0: p.y, index: slide().shapes.length - 1 };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (handleEl && handleEl.dataset.handle === 'rotate' && selectedShape()) {
    state.drag = {
      mode: 'rotate',
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
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

  const index = hitShape ? slide().shapes.indexOf(hitShape) : selectedShapeIndexAtPoint(p);
  const additive = event.shiftKey && !(event.metaKey || event.ctrlKey);
  if (index >= 0) {

    const secondPress = isSecondPress(index);
    let editOnClick = '';
    if (secondPress && !(event.shiftKey || event.metaKey || event.ctrlKey)) {
      if (slide().shapes[index].kind === 'code') editOnClick = 'code';
      else if (canEditText(slide().shapes[index])) editOnClick = 'text';
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
      editOnClick,
      editIndex: index,
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
    const delta = L.unrotateDelta(dx, dy, drag.from.rotation);
    resize(shape, drag.from, drag.handle, delta.x, delta.y);
  } else if (drag.mode === 'rotate') {
    const shape = selectedShape();
    if (!shape) return;
    shape.rotation = L.rotationTowards(drag.from, p.x, p.y, event.shiftKey);
  } else if (drag.mode === 'crop') {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    const delta = L.unrotateDelta(dx, dy, drag.from.rotation);
    const fraction = drag.side === 'left' || drag.side === 'right'
      ? delta.x / shape.w
      : delta.y / shape.h;
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
  } else if (drag.mode === 'move' && !drag.moved && drag.editOnClick) {
    selectOnly(drag.editIndex);
    renderCanvas();
    renderProps();
    if (drag.editOnClick === 'code') openCodeDialog(drag.editIndex, false);
    else startTextEdit(drag.editIndex);
    return;
  } else if (drag.mode === 'move' && !drag.moved && drag.toggleIndex >= 0) {
    // A Shift-press that never moved: the click half of Shift-click.
    selectMany(L.toggleSelection(state.selection, drag.toggleIndex, slide().shapes.length));
  } else if (drag.mode === 'resize' || drag.mode === 'rotate' || drag.mode === 'crop' || drag.moved) {
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
  const scale = canvas.getBoundingClientRect().width / deckSize().width;
  // The same inset the glyphs are drawn at, so text does not jump sideways
  // when editing starts inside a rect or an ellipse.
  const box = L.textBox(shape);
  const lines = L.wrapTextLines(textEditor.value, box.w, shape.fontSize).length;
  // The overlay has to be anchored the way the glyphs it hides are, or text
  // inside a shape is typed at the top of the box and jumps to the middle the
  // moment editing ends. A textarea cannot anchor its own content, so the box
  // is shrunk to the text and placed where that text belongs.
  const block = Math.max(1, lines) * shape.fontSize * 1.3;
  const anchored = shape.verticalAlign === 'center'
    ? Math.max(0, (box.h - block) / 2)
    : shape.verticalAlign === 'bottom'
    ? Math.max(0, box.h - block)
    : 0;
  textEditor.style.left = `${box.x * scale}px`;
  textEditor.style.top = `${(box.y + anchored) * scale}px`;
  textEditor.style.width = `${Math.max(box.w, 1) * scale}px`;
  textEditor.style.height = `${(shape.verticalAlign === 'top' ? Math.max(box.h, block) : block) * scale}px`;
  textEditor.style.fontSize = `${shape.fontSize * scale}px`;
  textEditor.style.fontFamily = `"${shape.fontFamily || S.DEFAULT_FONT_FAMILY}", sans-serif`;
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
  textEditBefore = structuredClone(shape);
  state.editingIndex = index;
  renderCanvas();

  textEditor.value = seed ? shape.text + seed : shape.text;
  if (seed && shape.kind === 'text') fitTextBoxForSlide(shape, textEditor.value);
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
  const before = textEditBefore;
  textEditBefore = null;
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
    fitTextBoxForSlide(shape, text);
  } else if (before && shape.kind === 'text') {
    shape.w = before.w;
    shape.h = before.h;
  }
  if (removed || changed) markDirty();
  renderAll();
}

textEditor.addEventListener('blur', commitTextEdit);
textEditor.addEventListener('input', () => {
  const shape = slide().shapes[state.editingIndex];
  if (!shape || shape.kind !== 'text') return;
  fitTextBoxForSlide(shape, textEditor.value);
  styleTextEditor(shape);
  renderCanvas();
});
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
  if (settingsDialog.open || slideSizeDialog.open || codeDialog.open || guidelinesDialog.open) return;
  if (event.key === 'Escape' && (!backgroundMenu.hidden || !codeBlockMenu.hidden)) {
    hideToolbarPopovers();
    event.preventDefault();
    return;
  }
  if (!presetMenu.hidden && event.key === 'Escape') {
    hidePresetMenu();
    event.preventDefault();
    return;
  }
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
    if (key === 'a' && slidesHaveFocus()) {
      setSlideSelection(state.deck.slides.map((_, index) => index));
      renderThumbs();
    } else if (key === 'a' && editorHasFocus()) {
      selectMany(slide().shapes.map((_, index) => index));
      renderCanvas();
      renderProps();
    } else if (key === 'n') newDeck();
    else if (key === 'o') openFile();
    else if (key === 's') saveFile(event.shiftKey);
    else if (key === 'z' && event.shiftKey) redo();
    else if (key === 'z') undo();
    else if (key === 'y') redo();
    else if (key === 'c' || key === 'v') return;
    else if (key === 'd') duplicateSelection();
    else if (key === 'arrowup' && slidesHaveFocus()) moveSelectedSlides(-1);
    else if (key === 'arrowdown' && slidesHaveFocus()) moveSelectedSlides(1);
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
  if (slidesHaveFocus() && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    selectAdjacentSlide(event.key === 'ArrowUp' ? -1 : 1);
    event.preventDefault();
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

const PRESET_STORAGE_KEY = 'akbun-makepresentation.custom-presets';
const DEFAULT_PRESET_LABELS = {
  'red-filled-rectangle': 'Filled rectangle',
  'red-outline-rectangle': 'Outline rectangle',
  'numbered-circle': 'Numbered circle',
  'right-open-arrow': 'Right open arrow',
  'left-open-arrow': 'Left open arrow',
};

function shapeBounds(shapes) {
  const boxes = shapes.map(L.shapeBBox);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// A preset lands in the top right corner rather than in the middle. The
// middle is where the slide's own content already is, so a preset dropped
// there had to be dragged off the content before it could be placed at all.
// The margins are the ones the content guideline uses.
const PRESET_MARGIN_X = 48;
const PRESET_MARGIN_Y = 36;

function cornerPresetShapes(shapes) {
  const copies = L.cloneShapes(shapes);
  const bounds = shapeBounds(copies);
  const dx = deckSize().width - PRESET_MARGIN_X - bounds.w - bounds.x;
  const dy = PRESET_MARGIN_Y - bounds.y;
  for (const shape of copies) L.moveShape(shape, dx, dy);
  return copies;
}

function readLegacyCustomPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '[]');
    return S.normalizeCustomPresets(parsed);
  } catch (_) {
    return [];
  }
}

async function loadPersistentSettings() {
  const stored = await window.api.loadSettings();
  const hasSettingsFile = !!stored && typeof stored === 'object';
  const legacyPresets = hasSettingsFile ? [] : readLegacyCustomPresets();
  appSettings = S.normalizeAppSettings(
    hasSettingsFile ? stored : { customPresets: legacyPresets }
  );
  syncConfiguredDefaults();
  customPresets = structuredClone(appSettings.customPresets);
  state.showGuidelines = appSettings.guidelines.visible;
  if (!hasSettingsFile || !S.settingsEqual(stored, appSettings)) {
    await window.api.saveSettings(appSettings);
  }
  if (!hasSettingsFile && legacyPresets.length) {
    localStorage.removeItem(PRESET_STORAGE_KEY);
  }
}

async function persistAppSettings(settings) {
  const normalized = S.normalizeAppSettings(settings);
  await window.api.saveSettings(normalized);
  appSettings = normalized;
  syncConfiguredDefaults();
}

function presetButton(preset, source) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-item';
  button.dataset.presetSource = source;
  button.dataset.presetId = preset.id;
  button.setAttribute('role', 'menuitem');
  button.title = preset.name;
  const preview = L.renderShapesSvg(preset.shapes);
  if (preview) button.insertAdjacentHTML('beforeend', preview.svg);
  const label = document.createElement('span');
  label.textContent = preset.name;
  button.append(label);
  return button;
}

function defaultPresets() {
  return L.DEFAULT_PRESET_IDS.map((id) => ({
    id,
    name: DEFAULT_PRESET_LABELS[id],
    shapes: L.defaultPresetShapes(id),
  }));
}

function renderPresetGrid(container, presets, source) {
  container.textContent = '';
  for (const preset of presets) container.append(presetButton(preset, source));
}

function renderPresetMenu() {
  renderPresetGrid($('default-presets'), defaultPresets(), 'default');
  renderPresetGrid($('custom-presets'), customPresets, 'custom');
  $('custom-presets-section').hidden = customPresets.length === 0;
}

async function persistCustomPresets(presets) {
  await persistAppSettings({ ...appSettings, customPresets: presets });
  customPresets = structuredClone(appSettings.customPresets);
  renderPresetMenu();
}

function positionPresetMenu() {
  const trigger = $('btn-preset').getBoundingClientRect();
  const bounds = presetMenu.getBoundingClientRect();
  presetMenu.style.left = `${Math.max(8, Math.min(
    trigger.left,
    window.innerWidth - bounds.width - 8
  ))}px`;
  const below = trigger.bottom + 6;
  presetMenu.style.top = `${below + bounds.height <= window.innerHeight
    ? below
    : Math.max(8, trigger.top - bounds.height - 6)}px`;
}

function showPresetMenu() {
  hideToolbarPopovers();
  renderPresetMenu();
  presetMenu.hidden = false;
  $('btn-preset').setAttribute('aria-expanded', 'true');
  positionPresetMenu();
  presetMenu.querySelector('.preset-item')?.focus();
}

function hidePresetMenu() {
  presetMenu.hidden = true;
  $('btn-preset').setAttribute('aria-expanded', 'false');
}

$('btn-preset').addEventListener('click', () => {
  if (presetMenu.hidden) showPresetMenu();
  else hidePresetMenu();
});

presetMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset-id]');
  if (!button) return;
  const preset = button.dataset.presetSource === 'default'
    ? defaultPresets().find((candidate) => candidate.id === button.dataset.presetId)
    : customPresets.find((candidate) => candidate.id === button.dataset.presetId);
  if (!preset) return;
  insertShapes(cornerPresetShapes(preset.shapes), 0);
  hidePresetMenu();
  canvas.focus({ preventScroll: true });
});

function positionToolbarPopover(popover, trigger) {
  const anchor = trigger.getBoundingClientRect();
  const bounds = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(
    anchor.left,
    window.innerWidth - bounds.width - 8
  ))}px`;
  const below = anchor.bottom + 6;
  popover.style.top = `${below + bounds.height <= window.innerHeight
    ? below
    : Math.max(8, anchor.top - bounds.height - 6)}px`;
}

function hideBackgroundMenu() {
  backgroundMenu.hidden = true;
  $('btn-background').setAttribute('aria-expanded', 'false');
}

function hideCodeBlockMenu() {
  codeBlockMenu.hidden = true;
  $('btn-code-block').setAttribute('aria-expanded', 'false');
}

function hideToolbarPopovers() {
  hideBackgroundMenu();
  hideCodeBlockMenu();
}

function showBackgroundMenu() {
  hidePresetMenu();
  hideCodeBlockMenu();
  renderBackground();
  backgroundMenu.hidden = false;
  $('btn-background').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(backgroundMenu, $('btn-background'));
}

function showCodeBlockMenu() {
  hidePresetMenu();
  hideBackgroundMenu();
  codeBlockMenu.hidden = false;
  $('btn-code-block').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(codeBlockMenu, $('btn-code-block'));
  codeBlockMenu.querySelector('[data-code-format]')?.focus();
}

$('btn-background').addEventListener('click', () => {
  if (backgroundMenu.hidden) showBackgroundMenu();
  else hideBackgroundMenu();
});

$('btn-code-block').addEventListener('click', () => {
  if (codeBlockMenu.hidden) showCodeBlockMenu();
  else hideCodeBlockMenu();
});

function codeLanguageLabel(language) {
  const labels = {
    plaintext: 'Plain text', javascript: 'JavaScript', typescript: 'TypeScript',
    html: 'HTML', css: 'CSS', rust: 'Rust', hcl: 'HCL / Terraform', bash: 'Bash',
    json: 'JSON', yaml: 'YAML', sql: 'SQL', java: 'Java', go: 'Go', c: 'C',
    cpp: 'C++', kotlin: 'Kotlin', swift: 'Swift', python: 'Python',
  };
  return labels[language] || language;
}

function populateCodeOptions() {
  const languageOptions = L.CODE_LANGUAGES.map(
    (language) => `<option value="${language}">${codeLanguageLabel(language)}</option>`
  ).join('');
  $('code-menu-language').innerHTML = languageOptions;
  $('code-language').innerHTML = languageOptions;
  $('code-menu-language').value = 'python';
  $('code-format').innerHTML = Object.entries(L.CODE_FORMATS).map(
    ([value, format]) => `<option value="${value}">${format.label}</option>`
  ).join('');
}

function defaultCode(language) {
  const examples = {
    python: 'def greet(name: str) -> str:\n  return f"Hello, {name}!"\n\nprint(greet("world"))',
    javascript: 'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("world"));',
    typescript: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}',
    html: '<main class="hero">\n  <h1>Hello, world!</h1>\n</main>',
    css: '.hero {\n  display: grid;\n  place-items: center;\n}',
    rust: 'fn main() {\n  println!("Hello, world!");\n}',
    hcl: 'resource "aws_s3_bucket" "example" {\n  bucket = "example-bucket"\n}',
    bash: '#!/usr/bin/env bash\nset -euo pipefail\necho "Hello, world!"',
    json: '{\n  "message": "Hello, world!"\n}',
    yaml: 'message: Hello, world!\nenabled: true',
    sql: 'SELECT id, name\nFROM users\nWHERE active = true;',
    java: 'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}',
    go: 'func main() {\n  fmt.Println("Hello, world!")\n}',
    c: 'int main(void) {\n  printf("Hello, world!\\n");\n  return 0;\n}',
    cpp: 'int main() {\n  std::cout << "Hello, world!\\n";\n}',
  };
  return examples[language] || '// Paste code here';
}

function insertCodeBlock(format, language) {
  const { width, height } = deckSize();
  const shape = L.createShape('code', width * 0.11, height * 0.14, newShapeStyle('code'));
  shape.w = width * 0.78;
  shape.h = height * 0.7;
  shape.fontSize = Math.max(16, Math.round(Math.min(width / 75, height / 42)));
  shape.codeFormat = format;
  shape.codeLanguage = language;
  shape.text = defaultCode(language);
  slide().shapes.push(shape);
  selectOnly(slide().shapes.length - 1);
  renderAll();
  openCodeDialog(state.selected, true);
}

codeBlockMenu.addEventListener('click', (event) => {
  const card = event.target.closest('[data-code-format]');
  if (!card) return;
  const language = $('code-menu-language').value;
  hideCodeBlockMenu();
  insertCodeBlock(card.dataset.codeFormat, language);
});

function lineNumberValue(lines) {
  return L.normalizeLineNumbers(lines).join(', ');
}

function openCodeDialog(index, isNew) {
  const shape = slide().shapes[index];
  if (!shape || shape.kind !== 'code') return;
  hideToolbarPopovers();
  codeEditIndex = index;
  codeEditIsNew = isNew;
  codeEditBefore = isNew ? null : structuredClone(shape);
  $('code-language').value = shape.codeLanguage || 'plaintext';
  $('code-format').value = shape.codeFormat || 'editor-dark';
  $('code-highlights').value = lineNumberValue(shape.codeHighlights);
  $('code-callouts').value = lineNumberValue(shape.codeCallouts);
  $('code-line-numbers').checked = shape.showLineNumbers !== false;
  $('code-source').value = shape.text || '';
  $('code-status').textContent = 'Use comma-separated lines or ranges, for example 2, 4-6.';
  codeDialog.showModal();
  $('code-source').focus();
  $('code-source').setSelectionRange(0, $('code-source').value.length);
}

function resetCodeEdit() {
  codeEditBefore = null;
  codeEditIndex = -1;
  codeEditIsNew = false;
}

function cancelCodeEdit(closeDialog = true) {
  if (codeEditIsNew && codeEditIndex >= 0) {
    slide().shapes.splice(codeEditIndex, 1);
    clearSelection();
    renderAll();
  }
  resetCodeEdit();
  if (closeDialog && codeDialog.open) codeDialog.close('cancel');
}

$('btn-code-cancel').addEventListener('click', () => cancelCodeEdit());
codeDialog.addEventListener('cancel', () => cancelCodeEdit(false));

$('code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const shape = slide().shapes[codeEditIndex];
  if (!shape || shape.kind !== 'code') {
    resetCodeEdit();
    codeDialog.close('cancel');
    return;
  }
  shape.text = $('code-source').value.replace(/\r\n/g, '\n');
  shape.codeLanguage = $('code-language').value;
  shape.codeFormat = $('code-format').value;
  shape.codeHighlights = L.normalizeLineNumbers($('code-highlights').value);
  shape.codeCallouts = L.normalizeLineNumbers($('code-callouts').value);
  shape.showLineNumbers = $('code-line-numbers').checked;
  const changed = codeEditIsNew || JSON.stringify(shape) !== JSON.stringify(codeEditBefore);
  resetCodeEdit();
  codeDialog.close('apply');
  if (changed) markDirty();
  renderAll();
  canvas.focus({ preventScroll: true });
});

$('code-source').addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const source = event.target;
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText('  ', start, end, 'end');
});

$('btn-copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code-source').value);
    $('code-status').textContent = 'Code copied.';
  } catch (_) {
    $('code-source').select();
    document.execCommand('copy');
    $('code-status').textContent = 'Code copied.';
  }
});

$('btn-paste-code').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const source = $('code-source');
    source.setRangeText(text, source.selectionStart, source.selectionEnd, 'end');
    source.focus();
    $('code-status').textContent = 'Code pasted.';
  } catch (_) {
    $('code-source').focus();
    $('code-status').textContent = 'Clipboard access was blocked. Press Cmd+V or Ctrl+V.';
  }
});

$('btn-edit-code').addEventListener('click', () => openCodeDialog(state.selected, false));

let guidelineUnit = 'px';

function guidelineValue(value, unit) {
  if (unit === 'cm') return String(L.pixelsToCentimeters(value));
  return String(Math.round(value * 100) / 100);
}

function setGuidelineFields(guidelines, unit) {
  for (const side of ['top', 'bottom', 'left', 'right']) {
    $(`guidelines-${side}`).value = guidelineValue(guidelines[side], unit);
  }
}

function guidelinesFromFields(unit = guidelineUnit) {
  const values = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const value = Number($(`guidelines-${side}`).value);
    if (!Number.isFinite(value) || value < 0) return null;
    values[side] = unit === 'cm' ? L.centimetersToPixels(value) : value;
  }
  return values;
}

function setGuidelineUnit(unit, guidelines) {
  guidelineUnit = unit;
  $('guidelines-unit').value = unit;
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const input = $(`guidelines-${side}`);
    input.max = unit === 'cm' ? '264.583' : '10000';
    input.step = unit === 'cm' ? '0.001' : '0.01';
  }
  setGuidelineFields(guidelines, unit);
}

function openGuidelinesDialog() {
  hideMenus();
  hidePresetMenu();
  hideToolbarPopovers();
  const guidelines = appSettings.guidelines;
  $('guidelines-status').textContent = '';
  $('guidelines-visible').checked = guidelines.visible;
  setGuidelineUnit(guidelines.unit, guidelines);
  guidelinesDialog.showModal();
  $('guidelines-visible').focus();
}

$('guidelines-unit').addEventListener('change', (event) => {
  const guidelines = guidelinesFromFields(guidelineUnit) || appSettings.guidelines;
  setGuidelineUnit(event.target.value, guidelines);
});

$('btn-guidelines-cancel').addEventListener('click', () => guidelinesDialog.close('cancel'));
$('guidelines-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const margins = guidelinesFromFields();
  const { width, height } = deckSize();
  if (!margins || !S.guidelineMarginsFit(width, height, margins)) {
    $('guidelines-status').textContent = 'Margins must leave space inside the slide.';
    return;
  }
  const guidelines = {
    visible: $('guidelines-visible').checked,
    unit: guidelineUnit,
    ...margins,
  };
  try {
    await persistAppSettings({ ...appSettings, guidelines });
    state.showGuidelines = appSettings.guidelines.visible;
    renderCanvas();
    guidelinesDialog.close('apply');
    canvas.focus({ preventScroll: true });
  } catch (_) {
    $('guidelines-status').textContent = 'Could not save guidelines on this device.';
  }
});

let slideSizeUnit = 'px';

function slideSizeValue(value, unit) {
  if (unit === 'cm') return String(L.pixelsToCentimeters(value));
  return String(Math.round(value * 100) / 100);
}

function setSlideSizeFields(size, unit) {
  $('slide-size-width').value = slideSizeValue(size.width, unit);
  $('slide-size-height').value = slideSizeValue(size.height, unit);
  syncSlideRatioButtons(size);
}

function slideSizeFromFields(unit = slideSizeUnit) {
  const width = Number($('slide-size-width').value);
  const height = Number($('slide-size-height').value);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return unit === 'cm'
    ? {
        width: L.centimetersToPixels(width),
        height: L.centimetersToPixels(height),
      }
    : { width, height };
}

function syncSlideRatioButtons(size) {
  const ratio = size && size.height ? size.width / size.height : 0;
  for (const button of slideSizeDialog.querySelectorAll('[data-slide-ratio]')) {
    const preset = L.slideSizePreset(button.dataset.slideRatio);
    const selected = preset && Math.abs(ratio - preset.width / preset.height) < 0.0001;
    button.setAttribute('aria-pressed', String(!!selected));
  }
}

function setSlideSizeUnit(unit, size) {
  slideSizeUnit = unit;
  $('slide-size-unit').value = unit;
  for (const input of [$('slide-size-width'), $('slide-size-height')]) {
    input.min = unit === 'cm' ? '1.693' : '64';
    input.max = unit === 'cm' ? '264.583' : '10000';
    input.step = unit === 'cm' ? '0.001' : '0.01';
  }
  setSlideSizeFields(size, unit);
}

function openSlideSizeDialog() {
  hideMenus();
  hidePresetMenu();
  $('slide-size-status').textContent = '';
  setSlideSizeUnit(slideSizeUnit, deckSize());
  slideSizeDialog.showModal();
  slideSizeDialog.querySelector('[data-slide-ratio][aria-pressed="true"]')?.focus();
}

slideSizeDialog.querySelector('.ratio-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-slide-ratio]');
  if (!button) return;
  const preset = L.slideSizePreset(button.dataset.slideRatio);
  if (preset) setSlideSizeFields(preset, slideSizeUnit);
});

$('slide-size-unit').addEventListener('change', (event) => {
  const size = slideSizeFromFields(slideSizeUnit) || deckSize();
  setSlideSizeUnit(event.target.value, size);
});

for (const input of [$('slide-size-width'), $('slide-size-height')]) {
  input.addEventListener('input', () => syncSlideRatioButtons(slideSizeFromFields()));
}

$('btn-slide-size-cancel').addEventListener('click', () => slideSizeDialog.close('cancel'));
$('slide-size-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const size = slideSizeFromFields();
  const before = deckSize();
  if (!size || !L.setSlideSize(state.deck, size.width, size.height)) {
    $('slide-size-status').textContent = slideSizeUnit === 'cm'
      ? 'Enter width and height from 1.693 to 264.583 cm.'
      : 'Enter width and height from 64 to 10,000 px.';
    return;
  }
  if (before.width !== state.deck.slideWidth || before.height !== state.deck.slideHeight) {
    markDirty();
    renderAll();
  }
  slideSizeDialog.close('apply');
  canvas.focus({ preventScroll: true });
});

function setSettingsPage(name) {
  for (const button of settingsDialog.querySelectorAll('[data-settings-page]')) {
    button.classList.toggle('active', button.dataset.settingsPage === name);
  }
  for (const panel of settingsDialog.querySelectorAll('[data-settings-panel]')) {
    panel.hidden = panel.dataset.settingsPanel !== name;
  }
}

function renderSettingsPresets() {
  const container = $('settings-presets');
  container.textContent = '';
  if (!settingsPresetDraft.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No custom presets saved.';
    container.append(empty);
    return;
  }
  for (const preset of settingsPresetDraft) {
    const row = document.createElement('div');
    row.className = 'settings-preset-row';
    const preview = L.renderShapesSvg(preset.shapes);
    if (preview) row.insertAdjacentHTML('beforeend', preview.svg);
    const name = document.createElement('span');
    name.textContent = preset.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removePreset = preset.id;
    remove.textContent = 'Delete';
    row.append(name, remove);
    container.append(row);
  }
}

function setBorderSettingsFields(prefix, border) {
  $(`settings-${prefix}-border-color`).value = border.color;
  $(`settings-${prefix}-border-width`).value = String(border.width);
  $(`settings-${prefix}-border-dash`).value = border.dash;
}

function renderGeneralSettings() {
  const defaults = appSettings.editorDefaults;
  const select = $('settings-default-font');
  const families = [...new Set([defaults.fontFamily, S.DEFAULT_FONT_FAMILY, ...fontFamilies])];
  select.textContent = '';
  for (const family of families) {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = family;
    option.style.fontFamily = `"${family}", sans-serif`;
    select.append(option);
  }
  select.value = defaults.fontFamily;
  setBorderSettingsFields('shape', defaults.shapeBorder);
  setBorderSettingsFields('image', defaults.imageBorder);
  $('general-settings-status').textContent = '';
}

function borderSettingsFromFields(prefix) {
  const width = Number($(`settings-${prefix}-border-width`).value);
  if (!Number.isFinite(width) || width < 1 || width > 30) return null;
  return {
    color: $(`settings-${prefix}-border-color`).value,
    width,
    dash: $(`settings-${prefix}-border-dash`).value,
  };
}

function editorDefaultsFromFields() {
  const shapeBorder = borderSettingsFromFields('shape');
  const imageBorder = borderSettingsFromFields('image');
  if (!shapeBorder || !imageBorder) return null;
  return {
    fontFamily: $('settings-default-font').value,
    shapeBorder,
    imageBorder,
  };
}

function openSettings() {
  hideMenus();
  hidePresetMenu();
  settingsPresetDraft = structuredClone(customPresets);
  $('preset-settings-status').textContent = '';
  setSettingsPage('general');
  renderGeneralSettings();
  renderSettingsPresets();
  settingsDialog.showModal();
  settingsDialog.querySelector('[data-settings-page="general"]')?.focus();
  void AiPanel.refreshStatus();
}

settingsDialog.querySelector('nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-settings-page]');
  if (button) {
    setSettingsPage(button.dataset.settingsPage);
    if (button.dataset.settingsPage === 'ai') void AiPanel.refreshStatus();
  }
});

$('settings-presets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-preset]');
  if (!button) return;
  settingsPresetDraft = settingsPresetDraft.filter(
    (preset) => preset.id !== button.dataset.removePreset
  );
  renderSettingsPresets();
});

$('btn-settings-cancel').addEventListener('click', () => settingsDialog.close('cancel'));
$('btn-settings-ok').addEventListener('click', async () => {
  const editorDefaults = editorDefaultsFromFields();
  if (!editorDefaults) {
    $('general-settings-status').textContent = 'Border width must be from 1 to 30.';
    setSettingsPage('general');
    return;
  }
  try {
    await persistAppSettings({
      ...appSettings,
      editorDefaults,
      customPresets: settingsPresetDraft,
    });
    customPresets = structuredClone(appSettings.customPresets);
    renderPresetMenu();
    renderProps();
    settingsDialog.close('ok');
  } catch (_) {
    $('general-settings-status').textContent = 'Could not save settings on this device.';
    setSettingsPage('general');
  }
});
settingsDialog.addEventListener('cancel', () => {
  settingsPresetDraft = [];
});

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
    .filter((shape) => shape.kind === 'text' || shape.kind === 'code')
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
  const shape = L.createShape('text', 80, 80, newShapeStyle('text'));
  shape.text = text.replace(/\r\n/g, '\n');
  fitTextBoxForSlide(shape, shape.text);
  return shape;
}

async function pastedImageShape(file, index) {
  const src = await readFileDataUrl(file);
  const size = await readImageSize(src);
  const slideDimensions = deckSize();
  const scale = Math.min(
    1,
    (slideDimensions.width * 0.8) / size.width,
    (slideDimensions.height * 0.8) / size.height
  );
  const shape = L.createShape('image', 0, 0, newShapeStyle('image'));
  shape.w = Math.max(1, size.width * scale);
  shape.h = Math.max(1, size.height * scale);
  shape.x = (slideDimensions.width - shape.w) / 2 + index * PASTE_OFFSET;
  shape.y = (slideDimensions.height - shape.h) / 2 + index * PASTE_OFFSET;
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
  setSlideSelection([state.current]);
  markDirty();
  renderAll();
}

// --- context menu and image export ------------------------------------------

function hideContextMenu() {
  contextMenu.hidden = true;
  slideContextMenu.hidden = true;
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
    fontFamilies = [...new Set([S.DEFAULT_FONT_FAMILY, ...installed.filter(
      (font) => typeof font === 'string' && font.trim()
    )])].sort((left, right) => left.localeCompare(right));
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
  const shapes = selectedShapes();
  $('context-save-preset').hidden = shapes.length !== 1 || shapes[0].kind === 'image';
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  const bounds = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  contextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  contextMenu.querySelector('button:not([hidden])')?.focus();
}

function showSlideContextMenu(x, y) {
  slideContextMenu.hidden = false;
  slideContextMenu.style.left = `${x}px`;
  slideContextMenu.style.top = `${y}px`;
  const bounds = slideContextMenu.getBoundingClientRect();
  slideContextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  slideContextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  $('context-new-slide').focus();
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
  if (!group) {
    const slidePanel = event.target.closest('#slides');
    const isEmptyArea = slidePanel && !event.target.closest('[data-slide], button');
    if (isEmptyArea) showSlideContextMenu(event.clientX, event.clientY);
    return;
  }
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
  if (!contextMenu.contains(event.target) && !slideContextMenu.contains(event.target)) {
    hideContextMenu();
  }
  if (!presetMenu.contains(event.target) && !$('btn-preset').contains(event.target)) hidePresetMenu();
  if (!backgroundMenu.contains(event.target) && !$('btn-background').contains(event.target)) {
    hideBackgroundMenu();
  }
  if (!codeBlockMenu.contains(event.target) && !$('btn-code-block').contains(event.target)) {
    hideCodeBlockMenu();
  }
  if (!fontPicker.contains(event.target)) hideFontMenu();
  if (!$('menubar').contains(event.target)) hideMenus();
});
window.addEventListener('blur', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
  hideFontMenu();
  hideMenus();
});
window.addEventListener('resize', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
  hideFontMenu();
  hideMenus();
});
$('stage-scroll').addEventListener('scroll', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
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

async function saveSelectionAsPreset() {
  hideContextMenu();
  const id = globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`;
  const preset = L.customPresetFromSelection(selectedShapes(), customPresets, id);
  if (!preset) return;
  if (JSON.stringify(preset).length > 500_000) {
    await window.api.message('This shape is too large to save as a preset.', {
      title: 'Preset save failed',
      kind: 'error',
    });
    return;
  }
  try {
    await persistCustomPresets([...customPresets, preset]);
  } catch (_) {
    await window.api.message('Could not save the preset on this device.', {
      title: 'Preset save failed',
      kind: 'error',
    });
  }
}

$('context-save-image').addEventListener('click', saveSelectionAsImage);
$('context-save-preset').addEventListener('click', saveSelectionAsPreset);
$('context-group').addEventListener('click', () => {
  hideContextMenu();
  groupSelection();
});
$('context-ungroup').addEventListener('click', () => {
  hideContextMenu();
  ungroupSelection();
});
$('context-new-slide').addEventListener('click', () => {
  hideContextMenu();
  addSlideAtEnd();
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
    for (const shape of shapes) {
      Object.assign(shape, patch);
      if (
        shape.kind === 'text' &&
        ['fontSize', 'fontFamily', 'bold', 'italic'].some((name) => Object.hasOwn(patch, name))
      ) {
        fitTextBoxForSlide(shape, shape.text);
      }
    }
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
$('btn-bg-all').addEventListener('click', async () => {
  const confirmed = await window.api.ask(
    'Apply this background to every slide?',
    { title: 'Apply background', kind: 'warning' }
  );
  if (!confirmed) return;
  setBackground(L.slideBackground(slide()), true);
  hideBackgroundMenu();
});

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

function selectAdjacentSlide(direction) {
  const next = Math.max(0, Math.min(state.current + direction, state.deck.slides.length - 1));
  if (next !== state.current) {
    state.current = next;
    setSlideSelection([next]);
    clearSelection();
    renderAll();
  }
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.focus();
}

$('thumbs').addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  const index = Number(thumb.dataset.slide);
  if (event.shiftKey) {
    const from = Math.min(state.current, index);
    const to = Math.max(state.current, index);
    setSlideSelection(Array.from({ length: to - from + 1 }, (_, offset) => from + offset));
    state.current = index;
  } else if (event.metaKey || event.ctrlKey) {
    const selected = new Set(state.slideSelection);
    if (selected.has(index) && selected.size > 1) selected.delete(index);
    else selected.add(index);
    setSlideSelection([...selected]);
    state.current = state.slideSelection.includes(index)
      ? index
      : state.slideSelection[state.slideSelection.length - 1];
  } else {
    state.current = index;
    setSlideSelection([index]);
  }
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
  setSlideSelection([at]);
  clearSelection();
  markDirty();
  renderAll();
}

function moveCurrentSlideAtEdge(target, edge) {
  const at = L.moveSlideAtEdge(state.deck, state.current, target, edge);
  if (at === state.current) return;
  state.current = at;
  setSlideSelection([at]);
  clearSelection();
  markDirty();
  renderAll();
}

function moveSelectedSlides(direction) {
  const currentSlide = slide();
  const before = selectedSlideIndices();
  const moved = L.moveSlideSelection(state.deck, before, direction);
  if (moved.every((index, offset) => index === before[offset])) return;
  state.current = state.deck.slides.indexOf(currentSlide);
  setSlideSelection(moved);
  clearSelection();
  markDirty();
  renderAll();
}

let dragSlideFrom = -1;
let dragSlideEdge = 'before';

$('thumbs').addEventListener('dragstart', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  dragSlideFrom = Number(thumb.dataset.slide);
  state.current = dragSlideFrom;
  setSlideSelection([dragSlideFrom]);
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
    element.classList.remove('drop-before', 'drop-after');
  }
  if (thumb) {
    const bounds = thumb.getBoundingClientRect();
    dragSlideEdge = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    thumb.classList.add(`drop-${dragSlideEdge}`);
  }
});

$('thumbs').addEventListener('dragleave', (event) => {
  event.target.closest('[data-slide]')?.classList.remove('drop-before', 'drop-after');
});

$('thumbs').addEventListener('drop', (event) => {
  const thumb = event.target.closest('[data-slide]');
  event.preventDefault();
  const from = dragSlideFrom;
  endSlideDrag();
  if (from < 0 || !thumb) return;
  state.current = from;
  moveCurrentSlideAtEdge(Number(thumb.dataset.slide), dragSlideEdge);
});

function endSlideDrag() {
  dragSlideFrom = -1;
  for (const element of $('thumbs').querySelectorAll('.drop-before, .drop-after')) {
    element.classList.remove('drop-before', 'drop-after');
  }
}

$('thumbs').addEventListener('dragend', endSlideDrag);

function addSlideAtEnd() {
  state.current = L.addSlide(state.deck, state.deck.slides.length - 1);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.scrollIntoView({ block: 'nearest' });
}

$('btn-add-slide').addEventListener('click', () => {
  state.current = L.addSlide(state.deck, state.current);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
});

// An empty slide goes without asking; one with work on it does not. Same
// answer whether the delete came from the button or from Backspace in the
// panel.
async function deleteCurrentSlide() {
  const indices = selectedSlideIndices();
  const hasContent = indices.some((index) => state.deck.slides[index]?.shapes.length);
  if (hasContent) {
    const message = indices.length === 1
      ? `Delete slide ${indices[0] + 1}?`
      : `Delete ${indices.length} selected slides?`;
    const sure = await window.api.ask(message, {
      title: 'Delete Slide',
      kind: 'warning',
    });
    if (!sure) return;
  }
  for (const index of [...indices].sort((left, right) => right - left)) {
    state.deck.slides.splice(index, 1);
  }
  if (state.deck.slides.length === 0) state.deck.slides.push(L.createSlide());
  state.current = Math.min(indices[0] || 0, state.deck.slides.length - 1);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
}

$('btn-del-slide').addEventListener('click', deleteCurrentSlide);
$('btn-slide-up').addEventListener('click', () => moveSelectedSlides(-1));
$('btn-slide-down').addEventListener('click', () => moveSelectedSlides(1));

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
  setSlideSelection([0]);
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
    setSlideSelection([0]);
    clearSelection();
    state.filePath = path;
    state.dirty = false;
    // The number flag has nowhere to live in a .pptx, so an opened file
    // starts with it off; any numbers baked in on save are plain text boxes.
    state.showNumbers = false;
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
function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function codeShapeDataUrl(shape) {
  const box = L.shapeBBox(shape);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${Math.max(1, box.w)} ${Math.max(1, box.h)}">` +
    `${L.renderShapeSvg(shape)}</svg>`;
  return `data:image/svg+xml;base64,${utf8Base64(svg)}`;
}

function deckForSave() {
  const hasCode = state.deck.slides.some(
    (target) => target.shapes.some((shape) => shape.kind === 'code')
  );
  if (!state.showNumbers && !hasCode) return state.deck;
  const copy = structuredClone(state.deck);
  for (const target of copy.slides) {
    for (const shape of target.shapes) {
      if (shape.kind === 'code') shape.src = codeShapeDataUrl(shape);
    }
  }
  const { width, height } = deckSize();
  if (state.showNumbers) {
    copy.slides.forEach((s, i) => s.shapes.push(L.slideNumberShape(i + 1, width, height)));
  }
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

function slideRasterSize() {
  const { width, height } = deckSize();
  const scale = Math.min(1.5, 4096 / width, 4096 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function rasterizeSlideCanvas(s, number) {
  return new Promise((resolve, reject) => {
    const slideDimensions = deckSize();
    const rasterSize = slideRasterSize();
    const svg = L.renderSlideSvg(s, { ...slideDimensions, number });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const raster = document.createElement('canvas');
      raster.width = rasterSize.width;
      raster.height = rasterSize.height;
      const context = raster.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('cannot create slide canvas'));
        return;
      }
      context.drawImage(image, 0, 0, raster.width, raster.height);
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
  return {
    dataUrl: raster.toDataURL('image/jpeg', 0.92),
    width: raster.width,
    height: raster.height,
  };
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
  const { width, height } = deckSize();
  present.innerHTML = L.renderSlideSvg(state.deck.slides[state.presentIndex], {
    width,
    height,
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
  present: enterPresent,
  settings: openSettings,
  guidelines: openGuidelinesDialog,
  numbers: toggleNumbers,
  'slide-size': openSlideSizeDialog,
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

function toggleNumbers() {
  state.showNumbers = !state.showNumbers;
  renderAll();
}
$('btn-update').addEventListener('click', () => window.api.checkUpdate());
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

function captureAiSlide(index) {
  const reference = state.deck.slides[index];
  if (!reference) return null;
  return {
    index,
    reference,
    slide: structuredClone(reference),
  };
}

function applyAiSlidePatch(target, patch) {
  const index = state.deck.slides.indexOf(target.reference);
  if (index < 0) throw new Error('The source slide was removed before AI finished.');
  const newSlide = AI.applySlidePatch(target.slide, patch);
  state.deck.slides.splice(index + 1, 0, newSlide);
  state.current = index + 1;
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
  return state.current + 1;
}

async function insertAiImage(_path, assetUrl) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`cannot read saved image (${response.status})`);
  const shape = await pastedImageShape(await response.blob(), 0);
  insertShapes([shape], 0);
}

async function initialize() {
  populateCodeOptions();
  try {
    await loadPersistentSettings();
  } catch (error) {
    await window.api.message(`Could not load settings.\n\n${error}`, {
      title: 'Settings unavailable',
      kind: 'error',
    });
  }
  setTool('select');
  setZoom(state.zoom);
  renderAll();
  loadSystemFonts();
  await AiPanel.initialize({
    currentSlideIndex: () => state.current,
    listSlides: () => state.deck.slides.map((_, index) => ({
      index,
      label: `Slide ${index + 1}`,
    })),
    captureSlide: captureAiSlide,
    applySlidePatch: applyAiSlidePatch,
    insertImage: insertAiImage,
    deckSize,
  });
}

void initialize();
