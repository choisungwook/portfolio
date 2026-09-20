'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fileContext(filePath, dirty, discard = true) {
  const actions = [];
  const context = vm.createContext({
    state: { filePath, dirty },
    window: { api: {
      isDesktop: true,
      pickOpen: async () => '/slides/opened.pptx',
      ask: async () => discard,
      launchDocument: async (path) => { actions.push(['launch', path]); },
      adoptDocument: async (path) => { actions.push(['adopt', path]); return `/canonical${path}`; },
      openDeck: async (path) => { actions.push(['load', path]); return { slides: [] }; },
      message: async (error) => { actions.push(['message', error]); },
    } },
    L: { fitTextHeight: () => {} },
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
