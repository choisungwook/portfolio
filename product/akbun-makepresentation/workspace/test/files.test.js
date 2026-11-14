'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fileContext(filePath, dirty, discard = true) {
  const actions = [];
  const context = vm.createContext({
    setTimeout,
    JSON,
    state: { filePath, dirty, deck: { slides: ['mine'] }, drag: null, editingIndex: -1 },
    updateTitle: () => { actions.push(['title']); },
    adoptExternalDeck: (deck) => { actions.push(['adopt-deck', deck]); },
    window: { api: {
      isDesktop: true,
      pickOpen: async () => '/slides/opened.pptx',
      ask: async () => discard,
      launchDocument: async (path) => { actions.push(['launch', path]); },
      adoptDocument: async (path) => { actions.push(['adopt', path]); return `/canonical${path}`; },
      openDeck: async (path) => { actions.push(['load', path]); return { slides: [] }; },
      acknowledgeDiskChange: async () => { actions.push(['ack']); },
      saveDeck: async () => true,
      message: async (error) => { actions.push(['message', error]); },
    } },
    L: { fitTextHeight: () => {}, sanitizeDeck: (deck) => deck },
    setSlideSelection: () => {},
    clearSelection: () => {},
    resetHistory: () => {},
    renderAll: () => {},
    loadPersistentSettings: async () => { actions.push(['settings']); },
    AiPanel: { reloadDocument: async () => { actions.push(['ai-reload']); } },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/files.js'), 'utf8'), context);
  return { context, actions };
}

test('opening a PPTX from an empty window loads it in that window', async () => {
  const { context, actions } = fileContext(null, false);
  await context.openFile();
  assert.deepEqual(actions, [
    ['adopt', '/slides/opened.pptx'],
    ['load', '/canonical/slides/opened.pptx'],
    ['settings'],
    ['ai-reload'],
  ]);
});

test('opening from an edited empty window respects discard refusal', async () => {
  const { context, actions } = fileContext(null, true, false);
  await context.openFile();
  assert.deepEqual(actions, []);
});

test('opening from an existing PPTX keeps the current window', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', true);
  await context.openFile();
  assert.deepEqual(actions, [['launch', '/slides/opened.pptx']]);
});

test('a file the operating system asks for goes through the same rule', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', false);
  await context.openDocument('/slides/dropped.pptx');
  assert.deepEqual(actions, [['launch', '/slides/dropped.pptx']]);
});

test('an adopt failure is reported and nothing is loaded', async () => {
  const { context, actions } = fileContext(null, false);
  context.window.api.adoptDocument = async () => { throw new Error('locked'); };
  await context.openFile();
  assert.deepEqual(actions, [['message', 'Error: locked']]);
});

test('a clean deck adopts the file another program wrote', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', false);
  await context.syncFromDisk();
  assert.deepEqual(actions, [['load', '/slides/current.pptx'], ['adopt-deck', { slides: [] }]]);
});

test('a dirty deck asks first; declining keeps the view and acknowledges the change', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', true, false);
  await context.syncFromDisk();
  assert.deepEqual(actions, [['ack']]);
});

test('a dirty deck that accepts loads the file', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', true, true);
  await context.syncFromDisk();
  assert.deepEqual(actions.map((a) => a[0]), ['load', 'adopt-deck']);
});

test('an identical file only clears the dirty mark', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', false);
  context.state.deck = { slides: [] };
  await context.syncFromDisk();
  assert.deepEqual(actions, [['load', '/slides/current.pptx'], ['title']]);
});

test('a save refused for a disk change keeps the deck dirty and runs the sync', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', true, false);
  context.deckForSave = () => ({ slides: [] });
  context.window.api.saveDeck = async () => false;
  await context.saveFile(false);
  assert.equal(context.state.dirty, true);
  assert.deepEqual(actions, [['title'], ['ack']]);
});

test('a drag in progress defers the reload until it ends', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', false);
  context.state.drag = {};
  const done = context.syncFromDisk();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(actions, []);
  context.state.drag = null;
  await done;
  assert.deepEqual(actions.map((a) => a[0]), ['load', 'adopt-deck']);
});

test('undo after adopting an external deck brings back the previous deck', () => {
  const context = vm.createContext({
    structuredClone,
    state: { deck: { slides: ['mine'] }, current: 0, dirty: true },
    invalidateDeckSearch: () => {}, setSlideSelection: () => {}, clearSelection: () => {},
    renderAll: () => {}, updateTitle: () => {},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/history.js'), 'utf8'), context);
  context.adoptExternalDeck({ slides: ['theirs'] });
  assert.deepEqual(context.state.deck.slides, ['theirs']);
  assert.equal(context.state.dirty, false);
  context.undo();
  assert.deepEqual(context.state.deck.slides, ['mine']);
  assert.equal(context.state.dirty, true);
});

test('keeping my version after a refused save saves it', async () => {
  const { context, actions } = fileContext('/slides/current.pptx', true, false);
  context.deckForSave = () => ({ slides: [] });
  let calls = 0;
  context.window.api.saveDeck = async () => { calls++; return calls > 1; };
  await context.saveFile(false);
  assert.equal(calls, 2);
  assert.equal(context.state.dirty, false);
  assert.deepEqual(actions.map((a) => a[0]), ['title', 'ack', 'title']);
});

test('an accepted load that cannot be read says so; a clean one is silent', async () => {
  const dirty = fileContext('/slides/current.pptx', true, true);
  dirty.context.window.api.openDeck = async () => { throw new Error('bad'); };
  dirty.context.setTimeout = (fn) => fn();
  await dirty.context.syncFromDisk();
  assert.deepEqual(dirty.actions.map((a) => a[0]), ['message']);
  const clean = fileContext('/slides/current.pptx', false);
  clean.context.window.api.openDeck = async () => { throw new Error('bad'); };
  clean.context.setTimeout = (fn) => fn();
  await clean.context.syncFromDisk();
  assert.deepEqual(clean.actions, []);
});
