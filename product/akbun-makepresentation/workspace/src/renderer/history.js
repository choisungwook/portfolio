'use strict';

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
