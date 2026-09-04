'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const shortcuts = require('../src/shortcuts.js');

test('split keeps both built-in shortcuts', () => {
  const split = shortcuts.resolved({}).find((shortcut) => shortcut.action === 'split');

  assert.deepEqual(split.keys, ['Meta+KeyB', 'Meta+KeyD']);
});

test('Cmd+F expands the Program Monitor', () => {
  const fullscreen = shortcuts.resolved({})
    .find((shortcut) => shortcut.action === 'monitor-fullscreen');

  assert.deepEqual(fullscreen.keys, ['Meta+KeyF']);
});

test('only changed shortcuts are saved as overrides', () => {
  const overrides = shortcuts.overridesFor({
    split: ['Meta+KeyB', 'Meta+KeyD'],
    undo: ['Meta+KeyU'],
  });

  assert.deepEqual(overrides, { undo: ['Meta+KeyU'] });
});

test('conflicts name both actions', () => {
  const map = shortcuts.resolved({ undo: ['Meta+KeyS'] });
  const [conflict] = shortcuts.conflicts(map);

  assert.equal(conflict.key, 'Meta+KeyS');
  assert.equal(conflict.first.action, 'save-project');
  assert.equal(conflict.second.action, 'undo');
});

test('typed shortcut input and keyboard events use the same chord', () => {
  assert.deepEqual(shortcuts.parseKeys('Cmd+B, Cmd+D'), ['Meta+KeyB', 'Meta+KeyD']);
  const split = shortcuts.resolved({}).find((shortcut) => shortcut.action === 'split');
  const action = shortcuts.actionFor({
    code: 'KeyD',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  }, [split]);

  assert.equal(action, 'split');
});

test('Ctrl falls back to Meta shortcuts after exact Ctrl bindings', () => {
  const action = shortcuts.actionFor({
    code: 'KeyB',
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
  }, shortcuts.resolved({}));

  assert.equal(action, 'split');
});

test('editable shortcut input labels Alt as Option', () => {
  assert.equal(shortcuts.inputKeys(['Alt+KeyA']), 'Option+A');
});
