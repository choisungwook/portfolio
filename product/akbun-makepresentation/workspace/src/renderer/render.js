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
    snapGuideSvg() +
    cropOverlay +
    (state.editingIndex < 0 ? selections : '') +
    marqueeSvg();
}

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
  $('props-crop').hidden = kind !== 'image' && kind !== 'code';
  $('props-crop-label').textContent = kind === 'code' ? 'Code block crop' : 'Image crop';
  $('btn-crop').classList.toggle('active', !!state.cropping);
  $('props-shape-align').hidden = state.selection.length < 2;
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
