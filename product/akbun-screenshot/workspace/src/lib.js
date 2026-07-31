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

module.exports = { buildScreenshotFilename, mergeSettings, previewPosition };
