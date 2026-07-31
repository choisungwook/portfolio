'use strict';

/* global constrain, nextNumber, fillFontSelect, wireFontSelect */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('wrap');
const colorInput = document.getElementById('color');
const fontSelect = document.getElementById('font');
const sizeInput = document.getElementById('size');

// The whole document is the undo history: undo moves the last shape into
// `undone`, redo moves it back. Nothing else is stored, so redrawing from the
// original image and this list always reproduces the current state.
const shapes = [];
const undone = [];

let tool = 'rect';
let draft = null;

// Image pixels per css pixel. The png from a retina display is twice the size
// it is shown at, so a 3px stroke would come out half as thick as it looks.
let unit = 1;

const image = new Image();

window.api.editorImage().then((dataUrl) => {
  image.src = dataUrl;
});

image.onload = () => {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const shown = canvas.getBoundingClientRect().width;
  unit = shown > 0 ? image.naturalWidth / shown : 1;
  sizeInput.value = Math.round(24 * unit);
  redraw();
};

window.api.getSettings().then((settings) => {
  fillFontSelect(fontSelect, [settings.defaultFont], settings.defaultFont);
  wireFontSelect(fontSelect, () => fontSelect.value || settings.defaultFont);
});

function redraw() {
  if (!image.complete) return;
  ctx.drawImage(image, 0, 0);
  for (const shape of shapes) drawShape(shape);
  if (draft) drawShape(draft);
}

function drawShape(s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';

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
  } else if (s.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
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

function style() {
  return {
    color: colorInput.value,
    width: Math.max(1, Math.round(3 * unit)),
    size: Number(sizeInput.value) || 24,
    font: fontSelect.value,
  };
}

// A new shape kills the redo stack, the same as any editor.
function push(shape) {
  shapes.push(shape);
  undone.length = 0;
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

  if (tool === 'number') {
    push({ type: 'number', x1: point.x, y1: point.y, n: nextNumber(shapes), ...style() });
    return;
  }
  if (tool === 'text') {
    askText(event, point);
    return;
  }
  draft = { type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y, ...style() };
});

// On window rather than on the canvas, so a drag that leaves the image still
// tracks and still finishes.
window.addEventListener('mousemove', (event) => {
  if (!draft) return;
  const point = toImage(event);
  const end = event.shiftKey
    ? constrain(draft.type, draft.x1, draft.y1, point.x, point.y)
    : point;
  draft.x2 = end.x;
  draft.y2 = end.y;
  redraw();
});

window.addEventListener('mouseup', () => {
  if (!draft) return;
  const shape = draft;
  draft = null;
  // A click with no drag would leave an invisible zero sized shape in the history.
  if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 2) push(shape);
  else redraw();
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

  input.addEventListener('keydown', (keyEvent) => {
    // Otherwise Cmd+Z while typing would undo the drawing behind the input.
    keyEvent.stopPropagation();
    if (keyEvent.key === 'Escape') input.remove();
    if (keyEvent.key !== 'Enter') return;
    if (input.value.trim()) {
      push({ type: 'text', x1: point.x, y1: point.y, text: input.value, ...style() });
    }
    input.remove();
  });

  input.addEventListener('blur', () => input.remove());
}

window.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  const from = event.shiftKey ? undone : shapes;
  const to = event.shiftKey ? shapes : undone;
  const shape = from.pop();
  if (shape) to.push(shape);
  redraw();
});

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    for (const other of document.querySelectorAll('[data-tool]')) {
      other.classList.toggle('active', other === button);
    }
  });
}

document.getElementById('save').addEventListener('click', () => {
  window.api.saveEditor(canvas.toDataURL('image/png'));
});

document.getElementById('close').addEventListener('click', () => window.api.closeEditor());

// The canvas scales with the window, so the ratio behind stroke width has to
// follow it. Existing shapes keep the width they were drawn with.
window.addEventListener('resize', () => {
  const shown = canvas.getBoundingClientRect().width;
  if (shown > 0 && canvas.width > 0) unit = canvas.width / shown;
});
