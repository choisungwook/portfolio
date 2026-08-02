'use strict';

// Pure helpers shared by main process code. No electron imports so tests
// can run with plain node.

function pad(n) {
  return String(n).padStart(2, '0');
}

// akbun-screenshot-2026-07-31-142530.png (local time)
function buildScreenshotFilename(date) {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `akbun-screenshot-${d}-${t}.png`;
}

// akbun-screenshot-2026-07-31-142530-edited-20260731143012.png. The stamp goes
// on the end of the name rather than replacing what is already there, so a
// capture and the edit made from it sort next to each other in the folder.
function buildEditedFilename(name, date) {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const dot = name.lastIndexOf('.');
  // A leading dot is the whole name of a hidden file, not an extension.
  if (dot <= 0) return `${name}-edited-${stamp}`;
  return `${name.slice(0, dot)}-edited-${stamp}${name.slice(dot)}`;
}

// Merge stored settings over defaults, keeping only known keys. A stored value
// has to match the type of the default it replaces, so a hand-edited file
// cannot turn the delete toggle into a string the editor reads as true.
function mergeSettings(defaults, stored) {
  const merged = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = stored ? stored[key] : undefined;
    if (typeof value !== typeof fallback) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    merged[key] = value;
  }
  return merged;
}

// Bottom-left position for the Nth preview window, stacking upward.
function previewPosition(workArea, size, index, margin = 20, gap = 12) {
  return {
    x: workArea.x + margin,
    y: workArea.y + workArea.height - margin - size.height - index * (size.height + gap),
  };
}

// Toolbar and padding around the canvas, in content pixels.
const EDITOR_CHROME = { width: 32, height: 92 };

// The toolbar does not fit below this, so a small screenshot still gets a wide
// window. The nine tool buttons next to Save, Save as and Close need about 780,
// and measured in a real window they wrap at 760 and sit on one row from 800 up.
// 860 is that threshold plus room for a longer button label.
const EDITOR_MIN_WIDTH = 860;

// Content size for the editor window. The png is in device pixels, so on a
// retina display it is twice the points the window is measured in; without the
// divide a normal selection opens a window larger than the screen.
function editorWindowSize(image, workArea, scaleFactor = 1, chrome = EDITOR_CHROME) {
  const width = Math.round(image.width / scaleFactor) + chrome.width;
  const height = Math.round(image.height / scaleFactor) + chrome.height;
  return {
    width: Math.min(Math.max(width, EDITOR_MIN_WIDTH), workArea.width),
    height: Math.min(height, workArea.height),
  };
}

module.exports = {
  buildEditedFilename,
  buildScreenshotFilename,
  editorWindowSize,
  mergeSettings,
  previewPosition,
};
