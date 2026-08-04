import mermaid from 'mermaid';

import {
  clampZoom,
  exportScale,
  fitZoom,
  isBlank,
  pngFileName,
  readSvgSize,
  withExplicitSize,
} from '../lib/diagram.js';

const STORAGE_CODE = 'akbun-rendermermaid.code';
const STORAGE_GRID = 'akbun-rendermermaid.grid';
const RENDER_DELAY_MS = 400;
const ZOOM_STEP = 1.25;

const SAMPLE = `flowchart LR
  A[Write mermaid] --> B{Valid?}
  B -- yes --> C[Render]
  B -- no --> D[Show the error]
  C --> E[Save PNG]
  C --> F[Large view]`;

const codeEl = document.querySelector('#code');
const diagramEl = document.querySelector('#diagram');
const previewEl = document.querySelector('#preview');
const statusEl = document.querySelector('#status');
const renderBtn = document.querySelector('#render');
const pngBtn = document.querySelector('#save-png');
const largeBtn = document.querySelector('#large');
const gridBtn = document.querySelector('#grid');
const largeView = document.querySelector('#large-view');
const largeStage = document.querySelector('#large-stage');
const largeCanvas = document.querySelector('#large-canvas');
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
let zoom = 1;
let largeSize = { width: 0, height: 0 };

/* ===== Rendering ===== */

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setDiagramActions(enabled) {
  pngBtn.disabled = !enabled;
  largeBtn.disabled = !enabled;
}

function showEmpty() {
  diagramEl.classList.add('is-empty');
  diagramEl.textContent = 'Type mermaid code on the left.';
  setDiagramActions(false);
  setStatus('Waiting for input.');
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
    // preview gets the same explicit size the PNG export uses. CSS then scales
    // it down when it is wider than the pane.
    const size = readSvgSize(svg);
    diagramEl.classList.remove('is-empty');
    diagramEl.innerHTML = withExplicitSize(svg, size.width, size.height);
    setDiagramActions(true);
    setStatus('Rendered.');
  } catch (error) {
    if (seq !== renderSeq) return;
    setStatus(error?.message ?? String(error), true);
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
  URL.revokeObjectURL(url);
}

async function savePng() {
  const svg = diagramEl.querySelector('svg');
  if (!svg) return;

  pngBtn.disabled = true;
  const markup = new XMLSerializer().serializeToString(svg);
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
    // PNG keeps transparency, and a transparent diagram is unreadable on a
    // dark background, so the export gets the same white the preview shows.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The PNG could not be encoded.');

    download(blob, pngFileName(codeEl.value, new Date()));
    setStatus(`Saved PNG at ${canvas.width}x${canvas.height}.`);
  } catch (error) {
    setStatus(error?.message ?? String(error), true);
  } finally {
    URL.revokeObjectURL(source);
    pngBtn.disabled = false;
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

function openLargeView() {
  const svg = diagramEl.querySelector('svg');
  if (!svg) return;

  largeCanvas.replaceChildren(svg.cloneNode(true));
  largeSize = readSvgSize(new XMLSerializer().serializeToString(svg));
  largeView.classList.add('open');
  setZoom(fitZoom(largeStage.clientWidth, largeStage.clientHeight, largeSize.width, largeSize.height));
}

function closeLargeView() {
  largeView.classList.remove('open');
  largeCanvas.replaceChildren();
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

  const gridOn = window.localStorage.getItem(STORAGE_GRID) !== 'off';
  previewEl.classList.toggle('grid-on', gridOn);
  gridBtn.setAttribute('aria-pressed', String(gridOn));
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
pngBtn.addEventListener('click', savePng);
largeBtn.addEventListener('click', openLargeView);

gridBtn.addEventListener('click', () => {
  const gridOn = previewEl.classList.toggle('grid-on');
  gridBtn.setAttribute('aria-pressed', String(gridOn));
  window.localStorage.setItem(STORAGE_GRID, gridOn ? 'on' : 'off');
});

document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom * ZOOM_STEP));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom / ZOOM_STEP));
document.querySelector('#zoom-reset').addEventListener('click', () => setZoom(1));
document.querySelector('#zoom-fit').addEventListener('click', () => {
  setZoom(fitZoom(largeStage.clientWidth, largeStage.clientHeight, largeSize.width, largeSize.height));
});
document.querySelector('#close-large').addEventListener('click', closeLargeView);

largeStage.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
}, { passive: false });

document.addEventListener('keydown', (event) => {
  if (!largeView.classList.contains('open')) return;
  if (event.key === 'Escape') closeLargeView();
  if (event.key === '+' || event.key === '=') setZoom(zoom * ZOOM_STEP);
  if (event.key === '-') setZoom(zoom / ZOOM_STEP);
  if (event.key === '0') setZoom(1);
});

dragToPan();
restore();
renderNow();
