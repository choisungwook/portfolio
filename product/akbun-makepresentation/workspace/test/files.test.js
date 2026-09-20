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
      closeWindow: async () => { actions.push(['close']); },
      message: async (error) => { actions.push(['message', error]); },
    } },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/files.js'), 'utf8'), context);
  return { context, actions };
}

test('opening a PPTX from an empty window replaces that window', async () => {
  const { context, actions } = fileContext(null, false);
  await context.openFile();
  assert.deepEqual(actions, [['launch', '/slides/opened.pptx'], ['close']]);
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
