'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const L = require('../src/editor');

function editorContext() {
  const shape = L.createShape('callout', 30, 40, {});
  shape.w = 100; shape.h = 80; shape.text = 'Hello clipboard';
  const slide = { shapes: [shape] };
  const events = {};
  const canvasEvents = {};
  const writes = [];
  const messages = [];
  const inserted = [];
  let nativeDrop;
  const api = {
    isDesktop: true,
    writeShapeClipboard: async (...payload) => { writes.push(payload); },
    readShapeClipboard: async () => null,
    onImageFilesDropped: (handler) => { nativeDrop = handler; return Promise.resolve(() => {}); },
    readImageFile: async () => 'data:image/png;base64,cG5n',
    message: async (text) => { messages.push(text); },
  };
  const context = vm.createContext({
    L, structuredClone, Promise, JSON, console,
    HTMLInputElement: class {}, HTMLSelectElement: class {}, HTMLTextAreaElement: class {},
    document: { addEventListener: (name, handler) => { events[name] = handler; } },
    window: { api, devicePixelRatio: 2 },
    Image: class {
      naturalWidth = 100;
      naturalHeight = 50;
      set src(_) { this.onload(); }
    },
    canvas: {
      addEventListener: (name, handler) => { canvasEvents[name] = handler; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 450 }),
    },
    state: { deck: { slides: [slide] }, current: 0, selection: [0] },
    slide: () => slide,
    deckSize: () => ({ width: 1920, height: 1080 }),
    newShapeStyle: () => ({ stroke: 'none' }),
    toPoint: ({ clientX, clientY }) => ({ x: clientX * 2.4, y: clientY * 2.4 }),
    selectedShapes: () => slide.shapes,
    rasterizeShapes: async () => 'data:image/png;base64,cG5n',
    clearSelection: () => {}, markDirty: () => {}, renderAll: () => {},
    insertShapes: (shapes, offset) => { inserted.push({ shapes, offset }); },
    SHAPE_CLIPBOARD_TYPE: 'application/x-akbun-makepresentation-shapes', PASTE_OFFSET: 24,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/clipboard'), 'utf8'), context);
  return { context, shape, slide, events, canvasEvents, writes, messages, inserted, api, nativeDrop };
}

test('native image drop imports only images at the slide position without a border', async () => {
  const { nativeDrop, inserted } = editorContext();
  await nativeDrop({ paths: ['picture.png', 'notes.txt'], position: { x: 600, y: 400 } });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].shapes.length, 1);
  assert.equal(inserted[0].shapes[0].kind, 'image');
  assert.equal(inserted[0].shapes[0].stroke, 'none');
  assert.equal(inserted[0].shapes[0].x, 670);
  assert.equal(inserted[0].shapes[0].y, 455);
});

test('image drop does not insert into a deck opened during file reading', async () => {
  const { context, nativeDrop, inserted, api } = editorContext();
  let finishRead;
  api.readImageFile = () => new Promise((resolve) => { finishRead = resolve; });
  const drop = nativeDrop({ paths: ['picture.png'], position: { x: 600, y: 400 } });
  context.state.deck = { slides: [] };
  finishRead('data:image/png;base64,cG5n');
  await drop;
  assert.equal(inserted.length, 0);
});

test('copy writes native PNG, text and editable object data together', async () => {
  const { context, writes } = editorContext();
  assert.equal(await context.copySelection(), true);
  const [shapes, text, png] = writes[0];
  assert.equal(JSON.parse(shapes)[0].kind, 'callout');
  assert.equal(text, 'Hello clipboard');
  assert.match(png, /^data:image\/png;base64,/);
});

test('cut retains objects if the system clipboard rejects the write', async () => {
  const { context, slide, api, messages } = editorContext();
  api.writeShapeClipboard = async () => { throw new Error('clipboard unavailable'); };
  await context.cutSelection();
  assert.equal(slide.shapes.length, 1);
  assert.match(messages[0], /clipboard unavailable/);
});

test('cut keeps edits made while the PNG is being prepared', async () => {
  const { context, slide, shape } = editorContext();
  let finish;
  context.rasterizeShapes = () => new Promise((resolve) => { finish = resolve; });
  const cut = context.cutSelection();
  await Promise.resolve();
  shape.text = 'Changed after copy';
  finish('data:image/png;base64,cG5n');
  await cut;
  assert.equal(slide.shapes.length, 1);
  assert.equal(slide.shapes[0].text, 'Changed after copy');
});

test('cut removes objects only after a successful native copy', async () => {
  const { context, slide, writes } = editorContext();
  await context.cutSelection();
  assert.equal(writes.length, 1);
  assert.equal(slide.shapes.length, 0);
});

test('cut copies locked objects while retaining the original selection', async () => {
  const { context, shape, slide, writes } = editorContext();
  shape.locked = true;
  let changed = false;
  context.clearSelection = () => { changed = true; };
  context.markDirty = () => { changed = true; };
  await context.cutSelection();
  assert.equal(JSON.parse(writes[0][0])[0].locked, true);
  assert.equal(slide.shapes[0], shape);
  assert.equal(changed, false);
});

test('cut copies a mixed selection and deletes only unlocked objects', async () => {
  const { context, shape, slide, writes } = editorContext();
  const locked = { ...shape, locked: true };
  slide.shapes.push(locked);
  context.state.selection = [0, 1];
  await context.cutSelection();
  assert.equal(JSON.parse(writes[0][0]).length, 2);
  assert.equal(slide.shapes.length, 1);
  assert.equal(slide.shapes[0], locked);
});

test('paste restores editable objects from another app instance', async () => {
  const { events, shape, api, inserted } = editorContext();
  api.readShapeClipboard = async () => JSON.stringify([shape]);
  let prevented = false;
  await events.paste({ target: {}, clipboardData: { getData: () => '', items: [], files: [] }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(inserted[0].shapes[0].kind, 'callout');
  assert.equal(inserted[0].offset, 24);
});
