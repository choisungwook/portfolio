'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../src/lib.js');

test('history records steps and ignores no-op changes', () => {
  const h = lib.createHistory({ exposure: 0 });
  assert.equal(h.push({ exposure: 0 }), false);
  h.push({ exposure: 1 });
  h.push({ exposure: 2 });
  assert.deepEqual(h.undo(), { exposure: 1 });
  assert.deepEqual(h.redo(), { exposure: 2 });
  h.undo();
  h.push({ exposure: 5 });
  assert.equal(h.canRedo, false);
  h.reset({ exposure: 9 });
  assert.equal(h.canUndo, false);
});

test('aspect crop fits inside the frame', () => {
  const square = lib.aspectRect(1, 1.5);
  assert.ok(Math.abs(square.h - 1) < 1e-9);
  assert.ok(Math.abs(square.w - 1 / 1.5) < 1e-9);
  assert.ok(Math.abs(square.x - (1 - square.w) / 2) < 1e-9);
  assert.deepEqual(lib.aspectRect(null, 1.5), { x: 0, y: 0, w: 1, h: 1 });
});

test('resize keeps the opposite corner and stays inside', () => {
  const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
  const grown = lib.resizeRect(r, 'se', 0.9, 0.9, null);
  assert.deepEqual([grown.x, grown.y], [0.2, 0.2]);
  assert.ok(grown.x + grown.w <= 1 && grown.y + grown.h <= 1);
  const nw = lib.resizeRect(r, 'nw', -0.1, 0, 1);
  assert.ok(Math.abs(nw.x + nw.w - 0.7) < 1e-9 && Math.abs(nw.y + nw.h - 0.7) < 1e-9);
  assert.ok(Math.abs(nw.w / nw.h - 1) < 1e-9);
  const tiny = lib.resizeRect(r, 'se', -1, -1, null);
  assert.ok(tiny.w >= 0.05 && tiny.h >= 0.05);
});

test('move clamps to the frame', () => {
  assert.deepEqual(lib.moveRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 1, -1), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
});

test('filter by folder does not match a sibling with the same prefix', () => {
  const photos = [
    { path: '/a/trip/1.jpg', name: '1.jpg', tags: ['sea'], rating: 3, edit: lib.DEFAULT_EDIT },
    { path: '/a/trip2/2.jpg', name: '2.jpg', tags: [], rating: 0, edit: { ...lib.DEFAULT_EDIT, exposure: 1 } },
  ];
  assert.equal(lib.filterPhotos(photos, { folder: '/a/trip' }).length, 1);
  assert.equal(lib.filterPhotos(photos, { search: 'SEA' }).length, 1);
  assert.equal(lib.filterPhotos(photos, { minRating: 1 }).length, 1);
  assert.equal(lib.filterPhotos(photos, { edited: true })[0].name, '2.jpg');
});

test('common tags split into all and some', () => {
  const r = lib.commonTags([{ tags: ['a', 'b'] }, { tags: ['a'] }]);
  assert.deepEqual(r, { all: ['a'], some: ['b'] });
});

test('selection follows Finder rules', () => {
  const order = [1, 2, 3, 4];
  assert.deepEqual([...lib.nextSelection(new Set([1]), order, 3, { range: true, anchor: 1 })], [1, 2, 3]);
  assert.deepEqual([...lib.nextSelection(new Set([1, 2]), order, 2, { toggle: true })], [1]);
  assert.deepEqual([...lib.nextSelection(new Set([1, 2]), order, 4, {})], [4]);
});

test('values format for people', () => {
  assert.equal(lib.formatValue('exposure', 0.5), '+0.50');
  assert.equal(lib.formatValue('straighten', -1.25), '-1.3°');
  assert.equal(lib.formatValue('contrast', 0), '0');
});

test('auto notes name the moved sliders or say nothing was needed', () => {
  const before = { ...lib.DEFAULT_EDIT };
  const after = { ...before, exposure: 0.7 };
  const { lines, changed } = lib.describeAuto(['brightness', 'contrast', 'straighten'], before, after);
  assert.deepEqual(lines, [
    'Brightness: Brightness +0.70',
    'Contrast: already fine, nothing changed',
    'Level: no clear horizon or vertical line, left as is',
  ]);
  assert.deepEqual(changed, ['exposure']);
  // Same non-zero value again: say what it is, not that nothing was needed.
  const kept = { ...after, contrast: 10 };
  assert.deepEqual(lib.describeAuto(['contrast'], kept, kept).lines, ['Contrast: unchanged, Contrast +10']);
});
