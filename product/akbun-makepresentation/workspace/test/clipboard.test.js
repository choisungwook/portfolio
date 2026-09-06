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
  const writes = [];
  const messages = [];
  const inserted = [];
  const api = {
    isDesktop: true,
    writeShapeClipboard: async (...payload) => { writes.push(payload); },
    readShapeClipboard: async () => null,
    message: async (text) => { messages.push(text); },
  };
  const context = vm.createContext({
    L, structuredClone, Promise, JSON, console,
    HTMLInputElement: class {}, HTMLSelectElement: class {}, HTMLTextAreaElement: class {},
    document: { addEventListener: (name, handler) => { events[name] = handler; } },
    window: { api },
    state: { deck: { slides: [slide] }, current: 0, selection: [0] },
    slide: () => slide,
    selectedShapes: () => slide.shapes,
    rasterizeShapes: async () => 'data:image/png;base64,cG5n',
    clearSelection: () => {}, markDirty: () => {}, renderAll: () => {},
    insertShapes: (shapes, offset) => { inserted.push({ shapes, offset }); },
    SHAPE_CLIPBOARD_TYPE: 'application/x-akbun-makepresentation-shapes', PASTE_OFFSET: 24,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/clipboard'), 'utf8'), context);
  return { context, shape, slide, events, writes, messages, inserted, api };
}

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
