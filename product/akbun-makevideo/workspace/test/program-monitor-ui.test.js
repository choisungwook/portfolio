'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createProgramMonitorUi, visualTransformFor } = require('../src/program-monitor-ui.js');

test('a drag preview leaves the project transform untouched', () => {
  const item = {
    id: 'shape-1',
    transform: { x: 10, y: 20, width: 100, height: 60, rotation: 0, opacity: 1 },
  };
  const next = { ...item.transform, x: 40, y: 50 };

  assert.strictEqual(visualTransformFor(item, { itemId: item.id, next }), next);
  assert.deepStrictEqual(item.transform, {
    x: 10,
    y: 20,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
  });
  assert.strictEqual(visualTransformFor(item, null), item.transform);
});

test('loading a document resets program monitor editing state through its controller', () => {
  const calls = [];
  const controller = createProgramMonitorUi({
    dom: {
      stage: {
        classList: {
          remove: (name) => calls.push(['remove', name]),
        },
      },
    },
    getPreview: () => ({
      setEditing: (active) => calls.push(['setEditing', active]),
    }),
  });

  controller.resetDocumentUi();

  assert.deepStrictEqual(calls, [
    ['remove', 'editing'],
    ['setEditing', false],
  ]);
});
