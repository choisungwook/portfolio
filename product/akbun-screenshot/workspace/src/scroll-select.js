'use strict';

const { invoke } = window.__TAURI__.core;
const box = document.getElementById('box');
const hint = document.getElementById('hint');
let start = null;

function rectFrom(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function draw(rect) {
  Object.assign(box.style, {
    display: 'block',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  // The box carries the dimming once it exists.
  document.body.style.background = 'transparent';
}

window.addEventListener('mousedown', (event) => {
  start = { x: event.clientX, y: event.clientY };
  hint.hidden = true;
});

window.addEventListener('mousemove', (event) => {
  if (start) draw(rectFrom(start, { x: event.clientX, y: event.clientY }));
});

window.addEventListener('mouseup', async (event) => {
  if (!start) return;
  const region = rectFrom(start, { x: event.clientX, y: event.clientY });
  start = null;
  try {
    await invoke('scroll_region_select', { region });
  } catch (error) {
    // Too small: let the user drag again.
    box.style.display = 'none';
    hint.textContent = String(error);
    hint.hidden = false;
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') invoke('window_close');
});
