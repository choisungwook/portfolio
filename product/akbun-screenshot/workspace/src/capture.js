'use strict';

const { BrowserWindow, clipboard, nativeImage, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildScreenshotFilename, previewPosition } = require('./lib');

const PREVIEW_SIZE = { width: 280, height: 200 };

// webContents.id -> { tmpFile, getSaveDir, win }, consumed by the preview IPC
// handlers. The window lives in the entry rather than in a separate list:
// finding it by scanning a list reads w.webContents on every element, which
// throws "Object has been destroyed" as soon as one of them is already closed.
const previews = new Map();

let capturing = false;

// Date.now() alone repeats within a millisecond, and two previews sharing one
// temp path means dismissing either deletes the other's image.
let tmpCounter = 0;

// Area capture via the native macOS screencapture binary: the OS draws the
// drag selection, so capture cost and quality match the system screenshot.
function captureArea(getSaveDir) {
  if (capturing) return;
  capturing = true;

  const tmpFile = path.join(
    os.tmpdir(),
    `akbun-screenshot-${Date.now()}-${tmpCounter++}.png`
  );
  execFile('screencapture', ['-i', '-s', '-x', tmpFile], () => {
    capturing = false;
    // user pressed Esc: screencapture exits without writing a file
    if (!fs.existsSync(tmpFile)) return;

    openPreview(tmpFile, getSaveDir);
  });
}

function openPreview(tmpFile, getSaveDir) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const pos = previewPosition(workArea, PREVIEW_SIZE, previews.size);

  const win = new BrowserWindow({
    ...PREVIEW_SIZE,
    ...pos,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // webContents is already destroyed once 'closed' fires, so the id has to be
  // read while the window is alive. Reading it later throws and the cleanup
  // below never runs, which leaves previews stacking off the top of the screen.
  const id = win.webContents.id;

  previews.set(id, { tmpFile, getSaveDir, win });
  win.on('closed', () => previews.delete(id));

  win.loadFile(path.join(__dirname, 'renderer', 'preview.html'), {
    query: { file: tmpFile },
  });
}

// Save button: copy the temp png into the configured save directory.
function savePreview(webContentsId) {
  const entry = previews.get(webContentsId);
  if (!entry) return null;

  const saveDir = entry.getSaveDir();
  fs.mkdirSync(saveDir, { recursive: true });
  const target = path.join(saveDir, buildScreenshotFilename(new Date()));
  fs.copyFileSync(entry.tmpFile, target);
  dismissPreview(webContentsId);
  return target;
}

// Copy button: put the image on the clipboard. The clipboard holds the bitmap
// itself, not a path, so dropping the temp file right after is safe.
function copyPreview(webContentsId) {
  const entry = previews.get(webContentsId);
  if (!entry) return;

  clipboard.writeImage(nativeImage.createFromPath(entry.tmpFile));
  dismissPreview(webContentsId);
}

// Also the Close button: keep nothing.
function dismissPreview(webContentsId) {
  const entry = previews.get(webContentsId);
  if (!entry) return;

  fs.rmSync(entry.tmpFile, { force: true });
  if (!entry.win.isDestroyed()) entry.win.close();
}

module.exports = { captureArea, savePreview, copyPreview, closePreview: dismissPreview };
