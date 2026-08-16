'use strict';

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
  if (!shape || (shape.kind !== 'image' && shape.kind !== 'code')) return;
  state.cropping = state.cropping ? null : { index: state.selected };
  renderAll();
}

function alignSelection(edge) {
  if (!L.alignShapes(slide().shapes, state.selection, edge)) return;
  markDirty();
  renderAll();
  canvas.focus({ preventScroll: true });
}

$('props-shape-align').addEventListener('click', (event) => {
  const button = event.target.closest('[data-shape-align]');
  if (button) alignSelection(button.dataset.shapeAlign);
});

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
