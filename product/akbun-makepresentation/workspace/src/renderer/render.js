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
const slideNotes = $('slide-notes');
const contextMenu = $('context-menu');
const slideContextMenu = $('slide-context-menu');
const presetMenu = $('preset-menu');
const shapesMenu = $('shapes-menu');
const insertMenu = $('insert-menu');
const tableMenu = $('table-menu');
const zoomMenu = $('zoom-menu');
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

// Every glyph the menus and the inspector header draw lives here once, 16x16
// on a 1.5 stroke, so a command looks the same wherever it is offered. Markup
// asks for one with data-glyph and applyGlyphs fills it in.
const GLYPHS = {
  front: '<rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="currentColor"/>',
  back: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="currentColor"/><rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/>',
  forward: '<rect x="3" y="7" width="10" height="6.5" rx="1.5"/><path d="M8 5.5V1.8M6.2 3.5 8 1.7l1.8 1.8"/>',
  backward: '<rect x="3" y="2.5" width="10" height="6.5" rx="1.5"/><path d="M8 10.5v3.7M6.2 12.5 8 14.3l1.8-1.8"/>',
  duplicate: '<rect x="2.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M5.5 5.5V4A1.5 1.5 0 0 1 7 2.5h6A1.5 1.5 0 0 1 14.5 4v6a1.5 1.5 0 0 1-1.5 1.5h-2.5M6.5 8v3M5 9.5h3"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
  group: '<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="2" stroke-dasharray="2 2"/><rect x="4.5" y="4.5" width="3" height="3"/><rect x="8.5" y="8.5" width="3" height="3"/>',
  ungroup: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  trash: '<path d="M2.8 4.5h10.4M6.4 4.5V3h3.2v1.5M4.2 4.5l.6 8a1.3 1.3 0 0 0 1.3 1.2h3.8a1.3 1.3 0 0 0 1.3-1.2l.6-8M6.8 7v4M9.2 7v4"/>',
  preset: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="7" r="1"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  slide: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M8 6v4M6 8h4"/>',
};

function glyphSvg(name) {
  return `<svg viewBox="0 0 16 16" class="glyph-icon" aria-hidden="true">${GLYPHS[name] || '<circle cx="8" cy="8" r="1.5" fill="currentColor"/>'}</svg>`;
}

function applyGlyphs(root = document) {
  for (const element of root.querySelectorAll('[data-glyph]')) element.innerHTML = glyphSvg(element.dataset.glyph);
}

// What the inspector header calls each kind of object.
const KIND_NAMES = {
  rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', image: 'Image', code: 'Code block',
  line: 'Line', arrow: 'Arrow', pen: 'Pen', callout: 'Speech bubble',
};

function syncConfiguredDefaults() {
  state.defaults = S.creationStyle('rect', appSettings.editorDefaults);
}

function newShapeStyle(kind) {
  return S.creationStyle(kind, appSettings.editorDefaults);
}

function fitTextBoxForSlide(shape, text) {
  if (shape.locked) return shape;
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

// The selection overlay shares the slide SVG viewBox, so its geometry is in
// slide units. Handles are the exception to "scales with the slide": they stay
// 8 screen pixels at every zoom, so the unit is recomputed from the canvas's
// on-screen width each render (a ResizeObserver below re-renders when it
// changes). With no layout yet, as in tests, it falls back to 12.
function handleUnits() {
  const width = canvas.getBoundingClientRect().width;
  return width > 0 ? 8 * deckSize().width / width : 12;
}

// Resize cursors in 45 degree steps. A rotated box still shows nwse on the
// corner that now points that way, so the cursor turns with the shape.
const RESIZE_CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

function handleCursor(id, rotation) {
  if (id === 'start' || id === 'end') return 'crosshair';
  const steps = Math.round((((Number(rotation) || 0) % 180) + 180) % 180 / 45);
  const base = id === 'nw' || id === 'se' ? 0 : id === 'ne' || id === 'sw' ? 2 : 3;
  return RESIZE_CURSORS[(base + steps) % 4];
}

// A fatter twin that follows the shape's own geometry. As `hover` it is the
// thin ring that answers a pointer passing over the shape. As `hit` it is
// invisible and makes a hairline as easy to click as a slab; as `halo` it is
// the glow that marks the shape selected. One geometry, so the thing that
// lights up is exactly the thing the pointer answers to.
//
// Text is caught by its filled box and everything else by a wide stroke, so
// the class carries `fill` to tell the two paints apart in css.
function outlineSvg(shape, kind) {
  if (kind === 'hit' && shape.stroke === 'none' && !['text', 'image', 'code'].includes(shape.kind)) return '';
  const scale = canvas.getBoundingClientRect().width / deckSize().width || 1;
  const strokeWidth = Number(shape.strokeWidth) || 0;
  // The ring is the shape's own stroke plus a hairline, so it hugs the outline
  // instead of drawing the wide halo that the hit twin is sized for.
  const width = kind === 'hover' ? strokeWidth + 2 / scale
    : kind === 'hit' ? strokeWidth + 4 / scale : strokeWidth + 6 / scale;
  const b = L.shapeBBox(shape);
  const cls = kind === 'hover' ? 'hover-ring' : kind;
  const attrs = `class="${cls}" stroke-width="${width}"`;
  // The same rotation the visible shape gets. Without it a rotated shape
  // answers the pointer in one place and lights up in another, and only the
  // glow makes that visible.
  return L.rotateSvg(shape, (() => {
    switch (shape.kind) {
      case 'callout':
        return `<polygon points="${L.calloutPoints(shape).map((p) => p.join(',')).join(' ')}" ${attrs}/>`;
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
        return `<rect x="${b.x}" y="${b.y}" width="${Math.max(b.w, 20)}" height="${Math.max(b.h, shape.fontSize * 1.3)}" class="${cls} fill" stroke-width="${width}"/>`;
      default:
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ${attrs}/>`;
    }
  })());
}

// The rotate grip: the round handle plus the three-quarter arc rotation
// carries as its icon everywhere else, so it does not read as one more resize
// handle that happens to sit further out.
function rotateHandleSvg(point, unit) {
  const r = unit * 0.625;
  const a = r * 0.55;
  const { x, y } = point;
  return (
    `<g data-handle="rotate" class="rot-handle">` +
    // Invisible and twice the visible size, so a small grip is still easy to hit.
    `<circle cx="${x}" cy="${y}" r="${unit}" class="handle-hit"/>` +
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
  handles = handles && !shape.locked;
  const unit = handleUnits();
  const parts = [];
  if (!handles || (shape.kind !== 'line' && shape.kind !== 'arrow')) {
    const b = L.shapeBBox(shape);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="sel-box"/>`
    );
  }
  if (handles) {
    for (const h of L.handlesFor(shape)) {
      const cursor = `cursor:${handleCursor(h.id, shape.rotation)}`;
      // The hit twin is 16 screen pixels, drawn under the visible square.
      parts.push(
        `<rect x="${h.x - unit}" y="${h.y - unit}" width="${unit * 2}" height="${unit * 2}" class="handle-hit" data-handle="${h.id}" style="${cursor}"/>` +
        `<rect x="${h.x - unit / 2}" y="${h.y - unit / 2}" width="${unit}" height="${unit}" rx="${unit * 0.19}" ry="${unit * 0.19}" class="sel-handle" data-handle="${h.id}" style="${cursor}"/>`
      );
    }
    const b = L.shapeBBox(shape);
    const grip = L.rotationHandleFor(shape);
    parts.push(
      `<line x1="${b.x + b.w / 2}" y1="${b.y}" x2="${grip.x}" y2="${grip.y}" class="rot-stem"/>`
    );
    parts.push(rotateHandleSvg(grip, unit));
  }
  return L.rotateSvg(shape, parts.join(''));
}

function marqueeSvg() {
  const drag = state.drag;
  if (!drag || drag.mode !== 'marquee') return '';
  const rect = L.normalizeRect(drag.x0, drag.y0, drag.x1, drag.y1);
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="2" class="selection-marquee${drag.contain ? ' contain' : ''}"/>`;
}

function snapGuideSvg() {
  const snap = state.drag?.mode === 'move' ? state.drag.snap : null;
  if (!snap) return '';
  const { width, height } = deckSize();
  const vertical = snap.vertical === null
    ? ''
    : `<line x1="${snap.vertical}" y1="0" x2="${snap.vertical}" y2="${height}"/>`;
  const horizontal = snap.horizontal === null
    ? ''
    : `<line x1="0" y1="${snap.horizontal}" x2="${width}" y2="${snap.horizontal}"/>`;
  return `<g class="snap-guides" aria-hidden="true">${vertical}${horizontal}</g>`;
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
  // The hover ring is hidden by css for dragging, and skipped for selected
  // shapes, which already carry the halo.
  canvas.toggleAttribute('data-dragging', !!state.drag);
  const shapes = slide()
    .shapes.map(
      (shape, i) =>
        `<g data-i="${i}"${state.selection.includes(i) ? ' class="sel"' : ''}${shape.locked ? ' data-locked' : ''}>${L.renderShapeSvg(shape, {
          hideText: i === state.editingIndex,
        })}${outlineSvg(shape, 'hit')}${outlineSvg(shape, 'hover')}</g>`
    )
    .join('');
  const showHandles = state.selection.length === 1 && state.editingIndex < 0;
  const selected = state.selection.map((index) => slide().shapes[index]).filter(Boolean);
  // Only lines get a glow: they have no box to show the selection. It draws
  // before the shapes so it reads as a backlight. Over them it
  // would tint a black line towards the accent and change the colour the user
  // picked.
  const halos = state.editingIndex < 0
    ? selected.filter((shape) => ['line', 'arrow', 'pen'].includes(shape.kind)).map((shape) => outlineSvg(shape, 'halo')).join('')
    : '';
  const groupBounds = selected.length > 1 ? L.boundsForShapes(selected) : null;
  const groupBox = groupBounds
    ? `<rect x="${groupBounds.x}" y="${groupBounds.y}" width="${groupBounds.w}" height="${groupBounds.h}" class="sel-group-box"/>`
    : '';
  const selections = groupBox + selected.map((shape) => selectionSvg(shape, showHandles)).join('');
  const cropOverlay = state.cropping ? cropOverlaySvg() : '';
  canvas.innerHTML =
    halos +
    shapes +
    slideNumberSvg(state.current) +
    guidelinesSvg() +
    snapGuideSvg() +
    cropOverlay +
    (state.editingIndex < 0 ? selections : '') +
    marqueeSvg();
}

// Handle size follows the on-screen scale, so a resize of the window or the
// panels has to redraw the overlay. Drawing never changes the canvas box, so
// this cannot loop.
new ResizeObserver(() => { if (state.deck) renderCanvas(); }).observe(canvas);

function cropOverlaySvg() {
  const shape = selectedShape();
  if (!shape || (shape.kind !== 'image' && shape.kind !== 'code')) return '';
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
  const selection = selectedShapes();
  const source = selection.find((shape) => !shape.locked) || shape || state.defaults;
  const kind = shape ? shape.kind : 'defaults';

  const isSvgImage = kind === 'image' &&
    /^data:image\/svg\+xml;base64,/i.test(shape?.src || '');
  const showFill = L.TEXTUAL.has(kind) || kind === 'defaults' || isSvgImage;
  const showStroke = kind !== 'text';
  const showText = kind === 'text' || L.TEXTUAL.has(kind) || kind === 'defaults';

  $('props-fill').hidden = !showFill;
  $('prop-fill-label').textContent = isSvgImage ? 'SVG fill' : 'Shape fill';
  $('prop-fill-none-label').textContent = isSvgImage ? 'Original colours' : 'No fill';
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
  $('btn-group').hidden = state.selection.length < 2;
  $('btn-ungroup').hidden = !state.selection.some((index) => slide().shapes[index]?.groupId);
  $('props-crop').hidden = (kind !== 'image' && kind !== 'code') || !!shape?.locked;
  $('props-crop-label').textContent = kind === 'code' ? 'Code block crop' : 'Image crop';
  $('btn-crop').classList.toggle('active', !!state.cropping);
  $('props-shape-align').hidden = state.selection.length < 2;
  $('props-shape-distribute').hidden = state.selection.length < 3;

  // With nothing selected the panel shows the slide's own properties. The
  // object rows would only be disabled defaults there, so they are hidden.
  const nothing = state.selection.length === 0;
  $('props-hint').textContent = nothing ? 'Slide'
    : state.selection.length > 1 ? `${state.selection.length} objects`
    : KIND_NAMES[kind] || kind;
  $('props-slide').hidden = !nothing;
  $('props-actions').hidden = nothing;
  if (nothing) {
    for (const id of ['props-fill', 'props-stroke', 'props-text', 'props-code']) $(id).hidden = true;
  }

  const allLocked = selection.every((shape) => shape.locked);
  // The slide section and the header buttons have their own rules below: the
  // lock button is the way back from a locked selection, so it never disables.
  for (const control of $('props').querySelectorAll('input, select, button')) {
    if ($('props-slide').contains(control) || $('props-actions').contains(control)) continue;
    control.disabled = !shape || allLocked;
  }
  $('btn-delete-shape').disabled = nothing || allLocked;
  const lockButton = $('btn-lock-shape');
  lockButton.setAttribute('aria-pressed', String(!nothing && allLocked));
  lockButton.title = allLocked ? 'Unlock' : 'Lock';
  lockButton.setAttribute('aria-label', lockButton.title);

  $('prop-fill-none').checked = source.fill === 'none';
  $('prop-fill').value = source.fill === 'none' ? '#ffffff' : source.fill;
  $('prop-fill').disabled ||= source.fill === 'none';
  $('prop-stroke-none').checked = source.stroke === 'none';
  $('prop-stroke').value = source.stroke === 'none' ? '#1a1a1a' : source.stroke;
  for (const id of ['prop-stroke', 'prop-width', 'prop-dash']) {
    $(id).disabled ||= source.stroke === 'none';
  }
  $('prop-width').value = source.strokeWidth;
  $('prop-dash').value = source.dash;
  $('prop-font-size').value = source.fontSize;
  $('prop-heading-level').value = Object.keys(appSettings.headingSizes)
    .find((level) => appSettings.headingSizes[level] === Number(source.fontSize)) || 'custom';
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
  // Same two values as the window title, so the two cannot disagree. Only the
  // base name is shown: the full path can carry the user's home directory.
  // textContent, because a file name is input.
  $('doc-name').textContent = name;
  $('doc-title').title = name;
  $('doc-status').textContent = state.dirty ? 'Edited' : '';
}

function renderAll() {
  renderCanvas();
  renderThumbs();
  renderProps();
  renderBackground();
  renderNotes();
  updateTitle();
}

// A focused box is left alone, so a redraw while typing cannot move the caret.
function renderNotes() {
  if (document.activeElement !== slideNotes) slideNotes.value = slide().notes || '';
}

// --- undo history -------------------------------------------------------------
//
// Every mutation already funnels through markDirty, so history hangs off that
// one hook instead of every call site. `committed` is the deck as of the last
// commit, which is exactly what an undo has to restore.
// ponytail: whole-deck snapshots. A slide of shapes is small; switch to diffs
// only if a deck ever gets big enough to feel it.
