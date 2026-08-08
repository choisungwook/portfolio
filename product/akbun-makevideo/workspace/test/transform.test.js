'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  containsPoint,
  hitItem,
  projectPoint,
  transformForDrag,
  visibleItems,
} = require('../src/transform.js');

const transform = { x: 100, y: 50, width: 200, height: 100, rotation: 0, opacity: 1 };

function item(id, zIndex, nextTransform = transform) {
  return { id, start: 0, duration: 60, zIndex, transform: nextTransform };
}

function project(items) {
  return {
    tracks: [
      { kind: 'video', hidden: false, visualItems: items },
      { kind: 'audio', hidden: false, visualItems: [item('audio', 99)] },
    ],
  };
}

test('display points become project pixels without carrying the monitor scale', () => {
  assert.deepStrictEqual(
    projectPoint({ x: 320, y: 180 }, { width: 640, height: 360 }, { width: 1920, height: 1080 }),
    { x: 960, y: 540 }
  );
});

test('selection reverses the rotation before testing the item rectangle', () => {
  const rotated = { ...transform, rotation: 90 };
  assert.strictEqual(containsPoint({ transform: rotated }, { x: 200, y: 150 }), true);
  assert.strictEqual(containsPoint({ transform: rotated }, { x: 350, y: 100 }), false);
});

test('topmost item wins except the current selection and its handles', () => {
  const lower = item('lower', 1);
  const upper = item('upper', 2);
  const model = project([lower, upper]);
  assert.strictEqual(hitItem(model, 0, { x: 200, y: 100 }, null).item.id, 'upper');
  assert.strictEqual(hitItem(model, 0, { x: 200, y: 100 }, 'lower').item.id, 'lower');
  assert.deepStrictEqual(hitItem(model, 0, { x: 100, y: 50 }, 'lower'), {
    item: lower,
    action: 'resize',
    handle: 'nw',
  });
});

test('only visible video track items participate in selection order', () => {
  const hidden = { kind: 'video', hidden: true, visualItems: [item('hidden', 10)] };
  const model = { tracks: [project([item('visible', 1)]).tracks[0], hidden] };
  assert.deepStrictEqual(visibleItems(model, 0).map(({ item: entry }) => entry.id), ['visible']);
});

test('a move changes only the project-space origin', () => {
  assert.deepStrictEqual(
    transformForDrag(transform, 'move', { x: 100, y: 50 }, { x: 130, y: 90 }),
    { ...transform, x: 130, y: 90 }
  );
});

test('a rotated resize keeps the opposite edge fixed', () => {
  const initial = { ...transform, rotation: 90 };
  const result = transformForDrag(initial, 'e', { x: 0, y: 0 }, { x: 200, y: 200 });
  assert.strictEqual(result.height, initial.height);
  assert.strictEqual(result.width, 200);
  assert.ok(Math.abs(result.x - 100) < 0.0001);
  assert.ok(Math.abs(result.y - 50) < 0.0001);
});

test('a rotate drag stores degrees on the shared transform', () => {
  const result = transformForDrag(transform, 'rotate', { x: 200, y: 0 }, { x: 300, y: 100 });
  assert.strictEqual(result.rotation, 90);
});
