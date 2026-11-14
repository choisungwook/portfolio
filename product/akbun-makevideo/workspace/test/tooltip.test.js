'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isStale, keepsTooltip, placeTooltip, tooltipText } = require('../src/tooltip.js');

const viewport = { width: 800, height: 600 };
const size = { width: 120, height: 24 };

test('the tooltip sits 6px below the target, centered on it', () => {
  const target = { left: 100, top: 100, right: 130, bottom: 128 };

  assert.deepEqual(placeTooltip(target, size, viewport), {
    left: 55,
    top: 134,
    placement: 'below',
  });
});

test('the tooltip flips above when the bottom edge has no room', () => {
  const target = { left: 100, top: 560, right: 130, bottom: 588 };

  assert.deepEqual(placeTooltip(target, size, viewport), {
    left: 55,
    top: 530,
    placement: 'above',
  });
});

test('the tooltip stays below when neither side has room', () => {
  const target = { left: 100, top: 10, right: 130, bottom: 38 };
  const tall = { width: 120, height: 580 };

  assert.equal(placeTooltip(target, tall, viewport).placement, 'below');
});

test('the tooltip is pushed inside the viewport on both sides', () => {
  const left = placeTooltip({ left: 0, top: 100, right: 20, bottom: 128 }, size, viewport);
  const right = placeTooltip({ left: 780, top: 100, right: 800, bottom: 128 }, size, viewport);

  assert.equal(left.left, 4);
  assert.equal(right.left, 800 - 120 - 4);
});

test('Tab and lone modifiers keep the tooltip, any other key hides it', () => {
  for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta']) assert.equal(keepsTooltip(key), true);
  for (const key of ['o', 'Escape', 'ArrowLeft', ' ']) assert.equal(keepsTooltip(key), false);
});

test('a target that left the page or is not drawn is stale', () => {
  const drawn = { isConnected: true, getClientRects: () => [{}] };

  assert.equal(isStale(drawn), false);
  assert.equal(isStale({ ...drawn, isConnected: false }), true);
  assert.equal(isStale({ ...drawn, getClientRects: () => [] }), true);
});

test('the current shortcut follows the sentence in parentheses, when there is one', () => {
  assert.equal(tooltipText('Split at the playhead', '⌘B / ⌘D'), 'Split at the playhead (⌘B / ⌘D)');
  assert.equal(tooltipText('Split at the playhead', ''), 'Split at the playhead');
});
