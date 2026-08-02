'use strict';

// Everything that touches the DOM: the canvas, the slide panel, the property
// panel, text editing, and presentation mode. Model math lives in editor.js.

const L = globalThis.slidesLib;

const state = {
  deck: L.createDeck(),
  current: 0,
  selected: -1,
  tool: 'select',
  filePath: null,
  dirty: false,
  defaults: Object.assign({}, L.DEFAULT_STYLE),
  drag: null,
  editingIndex: -1,
  presenting: false,
  presentIndex: 0,
};

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const stageInner = $('stage-inner');
const textEditor = $('text-editor');
const present = $('present');

const slide = () => state.deck.slides[state.current];
const selectedShape = () =>
  state.selected >= 0 ? slide().shapes[state.selected] : null;

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

function selectionSvg(shape) {
  const parts = [];
  if (shape.kind !== 'line' && shape.kind !== 'arrow') {
    const b = L.shapeBBox(shape);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="sel-box"/>`
    );
  }
  for (const h of L.handlesFor(shape)) {
    parts.push(
      `<rect x="${h.x - HANDLE / 2}" y="${h.y - HANDLE / 2}" width="${HANDLE}" height="${HANDLE}" class="sel-handle" data-handle="${h.id}"/>`
    );
  }
  return parts.join('');
}

function renderCanvas() {
  const shapes = slide()
    .shapes.map(
      (shape, i) =>
        `<g data-i="${i}">${L.renderShapeSvg(shape, {
          hideText: i === state.editingIndex,
        })}${hitSvg(shape)}</g>`
    )
    .join('');
  const sel = selectedShape();
  canvas.innerHTML = shapes + (sel && state.editingIndex < 0 ? selectionSvg(sel) : '');
}

function renderThumbs() {
  $('thumbs').innerHTML = state.deck.slides
    .map(
      (s, i) =>
        `<div class="thumb${i === state.current ? ' active' : ''}" data-slide="${i}">` +
        `${L.renderSlideSvg(s)}<span class="num">${i + 1}</span></div>`
    )
    .join('');
}

function renderProps() {
  const shape = selectedShape();
  const source = shape || state.defaults;
  const kind = shape ? shape.kind : 'defaults';

  const showFill = kind === 'rect' || kind === 'ellipse' || kind === 'defaults';
  const showStroke = kind !== 'text';
  const showText = kind === 'text' || kind === 'defaults';

  $('props-fill').hidden = !showFill;
  $('props-stroke').hidden = !showStroke;
  $('props-text').hidden = !showText;
  $('btn-delete-shape').hidden = !shape;
  $('props-hint').textContent = shape
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
  updateTitle();
}

function markDirty() {
  state.dirty = true;
  // Some callers redraw only the canvas, so the title dot updates here
  // rather than waiting for the next full render.
  updateTitle();
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
    state.selected = slide().shapes.length - 1;
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
  if (handleEl && selectedShape()) {
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
    state.selected = Number(group.dataset.i);
    state.drag = {
      mode: 'move',
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  } else {
    state.selected = -1;
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
    L.dragShape(slide().shapes[drag.index], drag.x0, drag.y0, p.x, p.y);
  } else {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    if (drag.mode === 'move') {
      L.moveShape(shape, dx, dy);
      drag.moved = drag.moved || dx !== 0 || dy !== 0;
    } else {
      L.resizeShape(shape, drag.from, drag.handle, dx, dy);
    }
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
      state.selected = drag.index;
      markDirty();
    }
    setTool('select');
  } else if (drag.mode === 'resize' || drag.moved) {
    markDirty();
  }
  renderAll();
});

canvas.addEventListener('dblclick', (event) => {
  const group = event.target.closest('g[data-i]');
  if (!group) return;
  const index = Number(group.dataset.i);
  if (slide().shapes[index].kind === 'text') {
    state.selected = index;
    renderCanvas();
    startTextEdit(index);
  }
});

// --- text editing -----------------------------------------------------------------

function startTextEdit(index) {
  const shape = slide().shapes[index];
  state.editingIndex = index;
  renderCanvas();

  const scale = canvas.getBoundingClientRect().width / L.SLIDE_W;
  const lines = (shape.text || '').split('\n').length;
  textEditor.value = shape.text;
  textEditor.style.left = `${shape.x * scale}px`;
  textEditor.style.top = `${shape.y * scale}px`;
  textEditor.style.width = `${Math.max(shape.w, 120) * scale}px`;
  textEditor.style.height = `${Math.max(shape.h, shape.fontSize * 1.3 * lines) * scale}px`;
  textEditor.style.fontSize = `${shape.fontSize * scale}px`;
  textEditor.style.color = shape.textColor;
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

  const text = textEditor.value.replace(/\s+$/, '');
  if (text === '') {
    slide().shapes.splice(index, 1);
    state.selected = -1;
  } else if (text !== shape.text) {
    shape.text = text;
    const lines = text.split('\n').length;
    shape.h = Math.max(shape.h, lines * shape.fontSize * 1.35);
  }
  if (text !== shape.text || text === '') markDirty();
  renderAll();
}

textEditor.addEventListener('blur', commitTextEdit);
textEditor.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Escape') textEditor.blur();
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

  const target = event.target;
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault();
    saveFile(false);
    return;
  }
  if (event.metaKey || event.ctrlKey) return;

  if (event.key === 'Delete' || event.key === 'Backspace') {
    deleteSelectedShape();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape') {
    state.selected = -1;
    renderCanvas();
    renderProps();
    return;
  }
  if (event.key.startsWith('Arrow')) {
    const shape = selectedShape();
    if (!shape) return;
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    L.moveShape(shape, dx, dy);
    markDirty();
    renderCanvas();
    event.preventDefault();
    return;
  }
  const tool = TOOL_KEYS[event.key.toLowerCase()];
  if (tool) setTool(tool);
});

function deleteSelectedShape() {
  if (state.selected < 0) return;
  slide().shapes.splice(state.selected, 1);
  state.selected = -1;
  markDirty();
  renderAll();
}

// --- property panel -------------------------------------------------------------------

function applyProp(patch) {
  const shape = selectedShape();
  if (shape) {
    Object.assign(shape, patch);
    markDirty();
    renderCanvas();
    renderThumbs();
  } else {
    Object.assign(state.defaults, patch);
  }
  renderProps();
}

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
$('btn-delete-shape').addEventListener('click', deleteSelectedShape);

// --- slide panel ------------------------------------------------------------------------

$('thumbs').addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  state.current = Number(thumb.dataset.slide);
  state.selected = -1;
  renderAll();
});

$('btn-add-slide').addEventListener('click', () => {
  state.current = L.addSlide(state.deck, state.current);
  state.selected = -1;
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
  state.selected = -1;
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
  state.selected = -1;
  state.filePath = null;
  state.dirty = false;
  renderAll();
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  const path = await window.api.pickOpen();
  if (!path) return;
  try {
    state.deck = await window.api.openDeck(path);
    state.current = 0;
    state.selected = -1;
    state.filePath = path;
    state.dirty = false;
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

async function saveFile(alwaysAsk) {
  let path = state.filePath;
  if (alwaysAsk || !path) {
    path = await window.api.pickSave(suggestName('pptx'), 'pptx');
    if (!path) return;
  }
  try {
    await window.api.saveDeck(path, state.deck);
    state.filePath = path;
    state.dirty = false;
    updateTitle();
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
  }
}

// Rasterize one slide for the pdf: SVG markup into an image, image onto a
// canvas, canvas to JPEG. 1920x1080 is plenty for print at this slide size.
function rasterizeSlide(s) {
  return new Promise((resolve, reject) => {
    const svg = L.renderSlideSvg(s);
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
    for (const s of state.deck.slides) pages.push(await rasterizeSlide(s));
    await window.api.exportPdf(path, pages);
    await window.api.message('PDF saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Export failed', kind: 'error' });
  }
}

// --- presentation mode ------------------------------------------------------------------------

function renderPresent() {
  present.innerHTML = L.renderSlideSvg(state.deck.slides[state.presentIndex]);
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
$('btn-update').addEventListener('click', () => window.api.checkUpdate());
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

setTool('select');
renderAll();
