'use strict';

const { BrowserWindow, clipboard, nativeImage, nativeTheme, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildScreenshotFilename, editorWindowSize, previewPosition } = require('./lib');

const PREVIEW_SIZE = { width: 280, height: 200 };

// webContents.id -> { tmpFile, getSaveDir, win }, consumed by the preview IPC
// handlers. The window lives in the entry rather than in a separate list:
// finding it by scanning a list reads w.webContents on every element, which
// throws "Object has been destroyed" as soon as one of them is already closed.
const previews = new Map();

// webContents.id -> { file, getSaveDir, win } for open editor windows. Same
// shape and same reasons as previews above.
const editors = new Map();

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

  // Every way a preview can end lands here: the three buttons, Cmd+W from the
  // default application menu, and app quit. Removing the temp png here rather
  // than in the button handlers is what keeps the last two from leaking it.
  win.on('closed', () => {
    previews.delete(id);
    fs.rmSync(tmpFile, { force: true });
  });

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
// itself, not a path, so the temp file going away with the preview is fine.
function copyPreview(webContentsId) {
  const entry = previews.get(webContentsId);
  if (!entry) return;

  clipboard.writeImage(nativeImage.createFromPath(entry.tmpFile));
  dismissPreview(webContentsId);
}

// Also the Close button. Closing is the only step: the 'closed' handler above
// removes the temp png and the map entry.
function dismissPreview(webContentsId) {
  const entry = previews.get(webContentsId);
  if (entry && !entry.win.isDestroyed()) entry.win.close();
}

// Edit button: open the editor on a copy of the temp png and dismiss the
// preview. A copy rather than the same path, because dismissing the preview
// deletes its temp file and the editor would race that deletion.
function openEditor(previewId) {
  const entry = previews.get(previewId);
  if (!entry) return;

  const file = path.join(
    os.tmpdir(),
    `akbun-screenshot-edit-${Date.now()}-${tmpCounter++}.png`
  );
  fs.copyFileSync(entry.tmpFile, file);
  const getSaveDir = entry.getSaveDir;
  dismissPreview(previewId);

  const display = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...editorWindowSize(
      nativeImage.createFromPath(file).getSize(),
      display.workArea,
      display.scaleFactor
    ),
    useContentSize: true,
    title: 'Edit screenshot',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const id = win.webContents.id;
  editors.set(id, { file, getSaveDir, win });
  win.on('closed', () => {
    editors.delete(id);
    fs.rmSync(file, { force: true });
  });

  win.loadFile(path.join(__dirname, 'renderer', 'editor.html'));
}

// The renderer draws the screenshot into a canvas and then reads it back with
// toDataURL, which a file:// image would taint. Handing it the bytes as a data
// URL keeps the canvas same-origin.
function editorImage(webContentsId) {
  const entry = editors.get(webContentsId);
  if (!entry) return null;
  return `data:image/png;base64,${fs.readFileSync(entry.file).toString('base64')}`;
}

const PNG_DATA_URL = 'data:image/png;base64,';

// Save button in the editor: write the edited canvas, not the original file.
// The payload is decoded before anything touches the disk, so a malformed one
// leaves no directory and no empty png behind.
function saveEditor(webContentsId, dataUrl) {
  const entry = editors.get(webContentsId);
  if (!entry) return null;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL)) return null;

  const png = Buffer.from(dataUrl.slice(PNG_DATA_URL.length), 'base64');
  if (png.length === 0) return null;

  const saveDir = entry.getSaveDir();
  fs.mkdirSync(saveDir, { recursive: true });
  const target = path.join(saveDir, buildScreenshotFilename(new Date()));
  fs.writeFileSync(target, png);
  closeEditor(webContentsId);
  return target;
}

function closeEditor(webContentsId) {
  const entry = editors.get(webContentsId);
  if (entry && !entry.win.isDestroyed()) entry.win.close();
}

module.exports = {
  captureArea,
  savePreview,
  copyPreview,
  closePreview: dismissPreview,
  openEditor,
  editorImage,
  saveEditor,
  closeEditor,
};
