'use strict';

// The preview lifecycle shipped broken twice, both times by reading a property
// of a BrowserWindow that macOS had already destroyed. Electron is not
// installed in the pull request job, so the two modules capture.js touches are
// faked here and the fake window throws on webContents after close, exactly as
// the real one does. Without that throw the test proves nothing.

const assert = require('node:assert');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const clipboardWrites = [];
const openedWindows = [];
let nextId = 1;

class FakeWindow {
  constructor() {
    this.id = nextId++;
    this.destroyed = false;
    this.listeners = {};
    openedWindows.push(this);
  }

  get webContents() {
    if (this.destroyed) throw new TypeError('Object has been destroyed');
    return { id: this.id };
  }

  on(event, handler) {
    this.listeners[event] = handler;
  }

  // main passes the temp png through the query string, so the fake can record
  // which file this preview belongs to.
  loadFile(_file, options) {
    this.tmpFile = options.query.file;
  }

  isDestroyed() {
    return this.destroyed;
  }

  close() {
    this.destroyed = true;
    this.listeners.closed?.();
  }
}

const fakeElectron = {
  BrowserWindow: FakeWindow,
  clipboard: { writeImage: (image) => clipboardWrites.push(image) },
  nativeImage: { createFromPath: (file) => ({ file }) },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
};

// screencapture would open the system drag selection, so it is replaced by a
// write of the file the real binary would have produced.
const fakeChildProcess = {
  ...require('node:child_process'),
  execFile: (_cmd, args, callback) => {
    fs.writeFileSync(args[3], 'png');
    callback();
  },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return fakeElectron;
  if (request === 'child_process') return fakeChildProcess;
  return load.call(this, request, ...rest);
};

const { captureArea, savePreview, copyPreview, closePreview } = require('../src/capture');

Module._load = load;

function withSaveDir(run) {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akbun-screenshot-test-'));
  try {
    return run(saveDir);
  } finally {
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
}

// Capture twice, close the first preview the way the user would, then act on
// the second. The old code scanned a list of windows to find the one to close,
// which touched the dead window and threw.
test('save still works after another preview was closed', () => {
  withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const first = nextId - 1;
    captureArea(() => saveDir);
    const second = nextId - 1;

    closePreview(first);
    const target = savePreview(second);

    assert.ok(target.startsWith(saveDir), 'saved into the configured directory');
    assert.strictEqual(fs.readdirSync(saveDir).length, 1);
  });
});

test('copy puts the image on the clipboard and keeps no temp file', () => {
  withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const id = nextId - 1;

    copyPreview(id);

    assert.strictEqual(clipboardWrites.length, 1, 'one clipboard write');
    assert.strictEqual(fs.existsSync(clipboardWrites[0].file), false, 'temp png removed');
  });
});

// Capture used to write to the clipboard before the preview even appeared.
// Copy is now the only thing that writes to it.
test('capture alone does not touch the clipboard', () => {
  withSaveDir((saveDir) => {
    clipboardWrites.length = 0;
    captureArea(() => saveDir);
    const id = nextId - 1;

    assert.strictEqual(clipboardWrites.length, 0);
    closePreview(id);
  });
});

// Close keeps nothing: no file in the save directory, no temp png left behind.
test('close keeps nothing', () => {
  withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const id = nextId - 1;

    closePreview(id);

    assert.strictEqual(fs.existsSync(saveDir) && fs.readdirSync(saveDir).length, 0);
    assert.doesNotThrow(() => closePreview(id), 'a second close is a no-op');
  });
});

// Cmd+W from the default application menu, and app quit, close the window
// without going through any button. The temp png has to go with it.
test('a window closed outside the buttons still removes the temp png', () => {
  withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const win = openedWindows.at(-1);

    win.close();

    assert.strictEqual(fs.existsSync(win.tmpFile), false);
  });
});
