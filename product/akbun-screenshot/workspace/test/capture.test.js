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

  // A preview gets its temp png through the query string, so the fake can
  // record which file it belongs to. The editor asks for its image over IPC
  // instead and passes no options.
  loadFile(page, options) {
    this.page = page;
    this.tmpFile = options?.query?.file;
  }

  isDestroyed() {
    return this.destroyed;
  }

  close() {
    this.destroyed = true;
    this.listeners.closed?.();
  }
}

// A failed save has to reach the user, so the test needs to see the dialog.
const dialogMessages = [];

// The first four bytes of every png. Enough for the fake nativeImage to tell a
// real payload from the text the other tests use as stand-in bytes.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const pngDataUrl = (bytes) =>
  `data:image/png;base64,${Buffer.concat([PNG_MAGIC, Buffer.from(bytes)]).toString('base64')}`;

const fakeElectron = {
  BrowserWindow: FakeWindow,
  clipboard: { writeImage: (image) => clipboardWrites.push(image) },
  dialog: {
    showMessageBox: (_win, options) => {
      dialogMessages.push(options);
      return Promise.resolve({ response: 0 });
    },
  },
  nativeImage: {
    createFromPath: (file) => ({ file, getSize: () => ({ width: 800, height: 600 }) }),
    // Electron hands back an empty image rather than throwing when the bytes
    // are not an image it can decode, so the fake decides the same way the real
    // one would: by looking at the bytes. Without that the empty case cannot be
    // told apart from the real one and the clipboard guard proves nothing.
    createFromBuffer: (buffer) => ({
      buffer,
      isEmpty: () => !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
    }),
  },
  nativeTheme: { shouldUseDarkColors: false },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
      scaleFactor: 2,
    }),
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

const {
  captureArea,
  savePreview,
  copyPreview,
  closePreview,
  openEditor,
  editorImage,
  saveEditor,
  copyEditor,
  closeEditor,
} = require('../src/capture');

Module._load = load;

// Awaits run, since the editor save path became async. Without the await the
// finally would remove the directory before the save had written into it.
async function withSaveDir(run) {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akbun-screenshot-test-'));
  try {
    return await run(saveDir);
  } finally {
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
}

// Capture twice, close the first preview the way the user would, then act on
// the second. The old code scanned a list of windows to find the one to close,
// which touched the dead window and threw.
test('save still works after another preview was closed', async () => {
  await withSaveDir((saveDir) => {
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

test('copy puts the image on the clipboard and keeps no temp file', async () => {
  await withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const id = nextId - 1;

    copyPreview(id);

    assert.strictEqual(clipboardWrites.length, 1, 'one clipboard write');
    assert.strictEqual(fs.existsSync(clipboardWrites[0].file), false, 'temp png removed');
  });
});

// Capture used to write to the clipboard before the preview even appeared.
// Copy is now the only thing that writes to it.
test('capture alone does not touch the clipboard', async () => {
  await withSaveDir((saveDir) => {
    clipboardWrites.length = 0;
    captureArea(() => saveDir);
    const id = nextId - 1;

    assert.strictEqual(clipboardWrites.length, 0);
    closePreview(id);
  });
});

// Close keeps nothing: no file in the save directory, no temp png left behind.
test('close keeps nothing', async () => {
  await withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const id = nextId - 1;

    closePreview(id);

    assert.strictEqual(fs.existsSync(saveDir) && fs.readdirSync(saveDir).length, 0);
    assert.doesNotThrow(() => closePreview(id), 'a second close is a no-op');
  });
});

// Cmd+W from the default application menu, and app quit, close the window
// without going through any button. The temp png has to go with it.
test('a window closed outside the buttons still removes the temp png', async () => {
  await withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const win = openedWindows.at(-1);

    win.close();

    assert.strictEqual(fs.existsSync(win.tmpFile), false);
  });
});

// Edit dismisses the preview, and dismissing a preview deletes its temp png.
// The editor works on a copy for exactly that reason.
test('edit keeps an image after the preview it came from is gone', async () => {
  await withSaveDir((saveDir) => {
    captureArea(() => saveDir);
    const previewId = nextId - 1;
    const previewWindow = openedWindows.at(-1);

    openEditor(previewId);
    const editorId = nextId - 1;

    assert.strictEqual(fs.existsSync(previewWindow.tmpFile), false, 'preview temp png gone');
    assert.ok(editorImage(editorId).startsWith('data:image/png;base64,'));

    closeEditor(editorId);
    assert.strictEqual(editorImage(editorId), null, 'editor temp png released');
  });
});

// Save writes the edited canvas, not the file the editor opened.
test('editor save writes the canvas bytes into the save directory', async () => {
  await withSaveDir(async (saveDir) => {
    captureArea(() => saveDir);
    openEditor(nextId - 1);
    const editorId = nextId - 1;

    const edited = `data:image/png;base64,${Buffer.from('edited').toString('base64')}`;
    const target = await saveEditor(editorId, edited);

    assert.ok(target.startsWith(saveDir), 'saved into the configured directory');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'edited');
    assert.strictEqual(await saveEditor(editorId, edited), null, 'the editor closed after saving');
  });
});

// The payload crosses an IPC boundary, so a broken one has to fail before the
// save directory is created rather than throw halfway through the write.
test('editor save refuses a payload that is not a png data url', async () => {
  await withSaveDir(async (saveDir) => {
    const missing = path.join(saveDir, 'nested');
    captureArea(() => missing);
    openEditor(nextId - 1);
    const editorId = nextId - 1;

    for (const bad of [undefined, '', 'not a data url', 'data:image/png;base64,']) {
      assert.strictEqual(await saveEditor(editorId, bad), null, `refused ${String(bad)}`);
    }

    assert.strictEqual(fs.existsSync(missing), false, 'no save directory created');
    assert.ok(
      await saveEditor(editorId, `data:image/png;base64,${Buffer.from('ok').toString('base64')}`)
    );
  });
});

// The canvas is the only copy of the annotated image. A write that fails
// silently reads as a dead button, and the next click is Close, which drops it.
test('editor save reports a failed write and keeps the editor open', async () => {
  await withSaveDir(async (saveDir) => {
    // A file where the save directory should be, so mkdir cannot make one.
    const blocked = path.join(saveDir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');

    captureArea(() => blocked);
    openEditor(nextId - 1);
    const editorId = nextId - 1;

    dialogMessages.length = 0;
    const png = `data:image/png;base64,${Buffer.from('edited').toString('base64')}`;
    assert.strictEqual(await saveEditor(editorId, png), null, 'reported as not saved');
    assert.strictEqual(dialogMessages.length, 1, 'the user was told');
    assert.match(dialogMessages[0].message, /save/i);
    // Still open, so the annotations can go somewhere else.
    assert.ok(editorImage(editorId), 'the editor is still alive');
  });
});

// Copy is the editor's other ending: the clipboard instead of a file, and the
// window closes either way. Nothing may reach the save directory.
test('editor copy writes the clipboard, closes the editor and saves no file', async () => {
  await withSaveDir(async (saveDir) => {
    captureArea(() => saveDir);
    openEditor(nextId - 1);
    const editorId = nextId - 1;

    clipboardWrites.length = 0;
    assert.strictEqual(copyEditor(editorId, pngDataUrl('edited')), true);

    assert.strictEqual(clipboardWrites.length, 1, 'one clipboard write');
    assert.strictEqual(fs.readdirSync(saveDir).length, 0, 'no file written');
    assert.strictEqual(editorImage(editorId), null, 'the editor closed');
    assert.strictEqual(copyEditor(editorId, pngDataUrl('edited')), false, 'a second copy is a no-op');
    assert.strictEqual(clipboardWrites.length, 1, 'and it wrote nothing more');
  });
});

// Writing an empty image would clear the clipboard, so a payload that is not an
// image has to stop before the write. Whatever the user copied last stays.
test('editor copy leaves the clipboard alone on a payload that is not an image', async () => {
  await withSaveDir(async (saveDir) => {
    captureArea(() => saveDir);
    openEditor(nextId - 1);
    const editorId = nextId - 1;

    clipboardWrites.length = 0;
    const notImages = [
      undefined,
      '',
      'not a data url',
      'data:image/png;base64,',
      // The prefix is right and the bytes are there, but they decode to nothing.
      `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`,
    ];
    for (const bad of notImages) {
      assert.strictEqual(copyEditor(editorId, bad), false, `refused ${String(bad)}`);
    }

    assert.strictEqual(clipboardWrites.length, 0, 'the clipboard was never written');
    // Refusing must not have closed the window, so a real copy still works.
    assert.strictEqual(copyEditor(editorId, pngDataUrl('edited')), true);
  });
});
