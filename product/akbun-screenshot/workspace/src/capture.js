'use strict';

const { BrowserWindow, clipboard, nativeImage, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildScreenshotFilename, previewPosition } = require('./lib');

const PREVIEW_SIZE = { width: 280, height: 200 };

// webContents.id -> temp png path, consumed by preview:save / preview:delete
const previewFiles = new Map();
const previewWindows = [];

let capturing = false;

// Area capture via the native macOS screencapture binary: the OS draws the
// drag selection, so capture cost and quality match the system screenshot.
function captureArea(getSaveDir) {
  if (capturing) return;
  capturing = true;

  const tmpFile = path.join(os.tmpdir(), `akbun-screenshot-${Date.now()}.png`);
  execFile('screencapture', ['-i', '-s', '-x', tmpFile], () => {
    capturing = false;
    // user pressed Esc: screencapture exits without writing a file
    if (!fs.existsSync(tmpFile)) return;

    clipboard.writeImage(nativeImage.createFromPath(tmpFile));
    openPreview(tmpFile, getSaveDir);
  });
}

function openPreview(tmpFile, getSaveDir) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const pos = previewPosition(workArea, PREVIEW_SIZE, previewWindows.length);

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

  previewFiles.set(win.webContents.id, { tmpFile, getSaveDir });
  previewWindows.push(win);
  win.on('closed', () => {
    previewFiles.delete(win.webContents.id);
    previewWindows.splice(previewWindows.indexOf(win), 1);
  });

  win.loadFile(path.join(__dirname, 'renderer', 'preview.html'), {
    query: { file: tmpFile },
  });
}

// Save button: move the temp png into the configured save directory.
function savePreview(webContentsId) {
  const entry = previewFiles.get(webContentsId);
  if (!entry) return null;

  const saveDir = entry.getSaveDir();
  fs.mkdirSync(saveDir, { recursive: true });
  const target = path.join(saveDir, buildScreenshotFilename(new Date()));
  fs.copyFileSync(entry.tmpFile, target);
  fs.unlinkSync(entry.tmpFile);
  closePreview(webContentsId);
  return target;
}

// Delete button: drop the temp png. The clipboard copy stays.
function deletePreview(webContentsId) {
  const entry = previewFiles.get(webContentsId);
  if (!entry) return;

  fs.rmSync(entry.tmpFile, { force: true });
  closePreview(webContentsId);
}

function closePreview(webContentsId) {
  const win = previewWindows.find((w) => w.webContents.id === webContentsId);
  if (win) win.close();
}

module.exports = { captureArea, savePreview, deletePreview };
