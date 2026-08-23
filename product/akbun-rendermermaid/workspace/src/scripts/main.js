import mermaid from 'mermaid';

import {
  clampZoom,
  errorText,
  exportScale,
  fitZoom,
  isBlank,
  pngFileName,
  readSvgSize,
  shrinkToFitZoom,
  stepZoom,
  withExplicitSize,
  zoomAction,
} from '../lib/diagram.js';

const STORAGE_CODE = 'akbun-rendermermaid.code';
const STORAGE_DOTS = 'akbun-rendermermaid.dots';
// The toggle used to be called the grid, and a reader's setting outlives a rename.
const STORAGE_GRID_LEGACY = 'akbun-rendermermaid.grid';
const RENDER_DELAY_MS = 400;
const RESIZE_DELAY_MS = 150;

const SAMPLE = `flowchart LR
  A[Write mermaid] --> B{Valid?}
  B -- yes --> C[Render]
  B -- no --> D[Show the error]
  C --> E[Save PNG]
  C --> F[Copy PNG]
  C --> G[Large view]`;

const codeEl = document.querySelector('#code');
const diagramEl = document.querySelector('#diagram');
const previewEl = document.querySelector('#preview');
const statusEl = document.querySelector('#status');
const renderBtn = document.querySelector('#render');
const refreshBtn = document.querySelector('#refresh');
const pngBtn = document.querySelector('#save-png');
const copyPngBtn = document.querySelector('#copy-png');
const largeBtn = document.querySelector('#large');
const dotsBtn = document.querySelector('#dots');
const previewZoomLabel = document.querySelector('#preview-zoom-level');
const largeView = document.querySelector('#large-view');
const largeStage = document.querySelector('#large-stage');
const largeCanvas = document.querySelector('#large-canvas');
const closeLargeBtn = document.querySelector('#close-large');
const zoomLabel = document.querySelector('#zoom-level');

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
  // A webfont is not fetched while the SVG is rasterized for the PNG, so a
  // system stack is what keeps the export identical to the preview.
  fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  // HTML labels are drawn inside a foreignObject, which canvas leaves blank.
  // Plain SVG text costs a little layout quality and makes the PNG correct.
  htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: true },
  class: { htmlLabels: false },
});

let renderSeq = 0;
let renderTimer = null;
let resizeTimer = null;
let zoom = 1;
let largeSize = { width: 0, height: 0 };
let launcher = null;

let previewZoom = 1;
let previewSize = { width: 0, height: 0 };
// Until the reader touches the zoom, every render re-fits the diagram. After
// that the chosen zoom survives the next keystroke, which is the whole point
// of having zoomed in on a corner of a big diagram.
let previewZoomPinned = false;

/* ===== Rendering ===== */

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function reportError(error) {
  setStatus(errorText(error), true);
}

function setDiagramActions(enabled) {
  setExportActions(enabled);
  largeBtn.disabled = !enabled;
}

function setExportActions(enabled) {
  pngBtn.disabled = !enabled;
  copyPngBtn.disabled = !enabled;
}

function showEmpty() {
  diagramEl.classList.add('is-empty');
  diagramEl.textContent = 'Type mermaid code on the left.';
  previewSize = { width: 0, height: 0 };
  setDiagramActions(false);
  setStatus('Waiting for input.');
}

/**
 * Sizes the rendered SVG for the current preview zoom. The size goes on the
 * element rather than into a transform, so the pane has something to scroll
 * over once the diagram is larger than it.
 */
function applyPreviewZoom() {
  previewZoomLabel.textContent = `${Math.round(previewZoom * 100)}%`;

  const svg = diagramEl.querySelector('svg');
  if (!svg || previewSize.width <= 0) return;

  svg.style.width = `${previewSize.width * previewZoom}px`;
  svg.style.height = `${previewSize.height * previewZoom}px`;
}

function setPreviewZoom(value, { pin = true } = {}) {
  previewZoom = clampZoom(value);
  if (pin) previewZoomPinned = true;
  applyPreviewZoom();
}

function previewFitZoom() {
  return shrinkToFitZoom(
    previewEl.clientWidth,
    previewEl.clientHeight,
    previewSize.width,
    previewSize.height,
  );
}

async function render() {
  const code = codeEl.value;
  if (isBlank(code)) {
    showEmpty();
    return;
  }

  const seq = ++renderSeq;
  const id = `mermaid-${seq}`;

  try {
    await mermaid.parse(code);
    const { svg } = await mermaid.render(id, code);
    if (seq !== renderSeq) return; // A newer keystroke already won.

    // Mermaid emits `width="100%"` with a max-width style. Inside a box that
    // shrinks to fit, that collapses the diagram to its minimum width, so the
    // preview gets the same explicit size the PNG export uses. The zoom then
    // scales it from there.
    const size = readSvgSize(svg);
    diagramEl.classList.remove('is-empty');
    diagramEl.innerHTML = withExplicitSize(svg, size.width, size.height);
    previewSize = size;
    setPreviewZoom(previewZoomPinned ? previewZoom : previewFitZoom(), { pin: false });
    setDiagramActions(true);
    setStatus('Rendered.');
  } catch (error) {
    if (seq !== renderSeq) return;
    reportError(error);
  } finally {
    // A failed render leaves its measuring node behind in the body.
    document.querySelector(`#d${id}`)?.remove();
  }
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, RENDER_DELAY_MS);
}

function renderNow() {
  window.clearTimeout(renderTimer);
  render();
}

/** Throws the drawn diagram away and starts over, back at the fitted zoom. */
function refresh() {
  window.clearTimeout(renderTimer);
  diagramEl.replaceChildren();
  diagramEl.classList.add('is-empty');
  diagramEl.textContent = 'Rendering…';
  setDiagramActions(false);
  previewZoomPinned = false;
  render();
}

/* ===== PNG export ===== */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The diagram could not be rasterized.'));
    image.src = url;
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Revoking in the same tick cancels the download in some browsers, because
  // the click has not necessarily started reading the blob yet.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The preview zoom lives in the SVG's inline style, and an inline width beats
 * the width attribute the export pins on. So the export works from a copy with
 * those two properties removed, and the PNG is the diagram's real size at any
 * zoom.
 */
function exportableMarkup(svg) {
  const copy = svg.cloneNode(true);
  copy.style.removeProperty('width');
  copy.style.removeProperty('height');
  return new XMLSerializer().serializeToString(copy);
}

async function rasterizePng(svg) {
  const markup = exportableMarkup(svg);
  const { width, height } = readSvgSize(markup);
  const scale = exportScale(width, height);
  const source = URL.createObjectURL(
    new Blob([withExplicitSize(markup, width, height)], { type: 'image/svg+xml;charset=utf-8' }),
  );

  try {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser refused a 2D canvas context.');

    // PNG keeps transparency, and a transparent diagram is unreadable on a
    // dark background, so the export gets the same white the preview shows.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The PNG could not be encoded.');

    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function savePng() {
  const svg = diagramEl.querySelector('svg');
  if (!svg) return;

  setExportActions(false);

  try {
    const png = await rasterizePng(svg);
    download(png.blob, pngFileName(codeEl.value, new Date()));
    setStatus(`Saved PNG at ${png.width}x${png.height}.`);
  } catch (error) {
    reportError(error);
  } finally {
    setExportActions(Boolean(diagramEl.querySelector('svg')));
  }
}

async function copyPng() {
  const svg = diagramEl.querySelector('svg');
  if (!svg) return;

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    reportError(new Error('Copying PNG images is not supported by this browser.'));
    return;
  }

  setExportActions(false);

  try {
    const pngPromise = rasterizePng(svg);
    const blobPromise = pngPromise.then((png) => png.blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    const png = await pngPromise;
    setStatus(`Copied PNG at ${png.width}x${png.height}.`);
  } catch (error) {
    reportError(error);
  } finally {
    setExportActions(Boolean(diagramEl.querySelector('svg')));
  }
}

/* ===== Large view ===== */

function applyZoom() {
  const svg = largeCanvas.querySelector('svg');
  if (!svg) return;

  svg.style.width = `${largeSize.width}px`;
  svg.style.height = `${largeSize.height}px`;
  svg.style.transform = `scale(${zoom})`;
  // The wrapper carries the scaled box, because a transform does not change
  // layout size and the stage would have nothing to scroll over.
  largeCanvas.style.width = `${largeSize.width * zoom}px`;
  largeCanvas.style.height = `${largeSize.height * zoom}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(value) {
  zoom = clampZoom(value);
  applyZoom();
}

function largeFitZoom() {
  return fitZoom(largeStage.clientWidth, largeStage.clientHeight, largeSize.width, largeSize.height);
}

function openLargeView() {
  const svg = diagramEl.querySelector('svg');
  if (!svg) return;

  largeSize = readSvgSize(exportableMarkup(svg));
  largeCanvas.replaceChildren(svg.cloneNode(true));
  largeView.classList.add('open');
  setZoom(largeFitZoom());

  // The overlay claims to be a modal, so the keyboard has to go into it.
  // Without this, tabbing walks the toolbar hidden behind the backdrop.
  launcher = document.activeElement;
  closeLargeBtn.focus();
}

function closeLargeView() {
  largeView.classList.remove('open');
  largeCanvas.replaceChildren();

  if (launcher instanceof HTMLElement) launcher.focus();
  launcher = null;
}

function dragToPan() {
  let origin = null;

  largeStage.addEventListener('pointerdown', (event) => {
    origin = {
      x: event.clientX,
      y: event.clientY,
      left: largeStage.scrollLeft,
      top: largeStage.scrollTop,
    };
    largeStage.setPointerCapture(event.pointerId);
    largeStage.classList.add('dragging');
  });

  largeStage.addEventListener('pointermove', (event) => {
    if (!origin) return;
    largeStage.scrollLeft = origin.left - (event.clientX - origin.x);
    largeStage.scrollTop = origin.top - (event.clientY - origin.y);
  });

  const stop = () => {
    origin = null;
    largeStage.classList.remove('dragging');
  };
  largeStage.addEventListener('pointerup', stop);
  largeStage.addEventListener('pointercancel', stop);
}

/* ===== Wiring ===== */

function restore() {
  const saved = window.localStorage.getItem(STORAGE_CODE);
  codeEl.value = saved ?? SAMPLE;

  const stored = window.localStorage.getItem(STORAGE_DOTS) ?? window.localStorage.getItem(STORAGE_GRID_LEGACY);
  const dotsOn = stored !== 'off';
  previewEl.classList.toggle('dots-on', dotsOn);
  dotsBtn.setAttribute('aria-pressed', String(dotsOn));
}

codeEl.addEventListener('input', () => {
  window.localStorage.setItem(STORAGE_CODE, codeEl.value);
  scheduleRender();
});

codeEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    renderNow();
  }
});

renderBtn.addEventListener('click', renderNow);
refreshBtn.addEventListener('click', refresh);
pngBtn.addEventListener('click', savePng);
copyPngBtn.addEventListener('click', copyPng);
largeBtn.addEventListener('click', openLargeView);

dotsBtn.addEventListener('click', () => {
  const dotsOn = previewEl.classList.toggle('dots-on');
  dotsBtn.setAttribute('aria-pressed', String(dotsOn));
  window.localStorage.setItem(STORAGE_DOTS, dotsOn ? 'on' : 'off');
});

document.querySelector('#preview-zoom-in').addEventListener('click', () => setPreviewZoom(stepZoom(previewZoom, 1)));
document.querySelector('#preview-zoom-out').addEventListener('click', () => setPreviewZoom(stepZoom(previewZoom, -1)));
document.querySelector('#preview-zoom-reset').addEventListener('click', () => setPreviewZoom(1));
document.querySelector('#preview-zoom-fit').addEventListener('click', () => setPreviewZoom(previewFitZoom()));

previewEl.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setPreviewZoom(stepZoom(previewZoom, event.deltaY < 0 ? 1 : -1));
}, { passive: false });

document.querySelector('#zoom-in').addEventListener('click', () => setZoom(stepZoom(zoom, 1)));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(stepZoom(zoom, -1)));
document.querySelector('#zoom-reset').addEventListener('click', () => setZoom(1));
document.querySelector('#zoom-fit').addEventListener('click', () => setZoom(largeFitZoom()));
closeLargeBtn.addEventListener('click', closeLargeView);

largeStage.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(stepZoom(zoom, event.deltaY < 0 ? 1 : -1));
}, { passive: false });

document.addEventListener('keydown', (event) => {
  const modifier = event.metaKey || event.ctrlKey;

  if (largeView.classList.contains('open')) {
    if (event.key === 'Escape') closeLargeView();
    // The overlay is the whole window, so it answers the bare keys as well.
    const action = zoomAction(event.key, true);
    if (!action) return;
    event.preventDefault();
    if (action === 'in') setZoom(stepZoom(zoom, 1));
    if (action === 'out') setZoom(stepZoom(zoom, -1));
    if (action === 'reset') setZoom(1);
    return;
  }

  // In the page the bare keys belong to the editor, so zooming needs Ctrl or
  // Cmd. preventDefault is what keeps the browser from zooming the page too.
  const action = zoomAction(event.key, modifier);
  if (!action) return;
  event.preventDefault();
  if (action === 'in') setPreviewZoom(stepZoom(previewZoom, 1));
  if (action === 'out') setPreviewZoom(stepZoom(previewZoom, -1));
  if (action === 'reset') setPreviewZoom(1);
});

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (previewZoomPinned || previewSize.width <= 0) return;
    setPreviewZoom(previewFitZoom(), { pin: false });
  }, RESIZE_DELAY_MS);
});

dragToPan();
restore();
renderNow();
