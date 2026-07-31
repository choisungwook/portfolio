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

// Merge stored settings over defaults, keeping only known keys.
function mergeSettings(defaults, stored) {
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (stored && typeof stored[key] === 'string' && stored[key].length > 0) {
      merged[key] = stored[key];
    }
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

// The toolbar does not fit below this, so a small screenshot still gets a wide window.
const EDITOR_MIN_WIDTH = 740;

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

module.exports = { buildScreenshotFilename, editorWindowSize, mergeSettings, previewPosition };
