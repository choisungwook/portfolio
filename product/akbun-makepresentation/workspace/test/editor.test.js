'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/editor.js');

test('createDeck starts with one empty slide', () => {
  const deck = L.createDeck();
  assert.strictEqual(deck.slides.length, 1);
  assert.deepStrictEqual(deck.slides[0].shapes, []);
});

test('dragShape normalizes a rect dragged up and left', () => {
  const shape = L.createShape('rect', 100, 100, {});
  L.dragShape(shape, 100, 100, 40, 60);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 40, y: 60, w: 60, h: 40 }
  );
});

test('dragShape keeps line direction', () => {
  const shape = L.createShape('line', 200, 200, {});
  L.dragShape(shape, 200, 200, 100, 260);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 200, y: 200, w: -100, h: 60 }
  );
});

test('dragShape appends pen points and skips micro-moves', () => {
  const shape = L.createShape('pen', 10, 10, {});
  L.dragShape(shape, 10, 10, 20, 10);
  L.dragShape(shape, 10, 10, 20.5, 10.5); // less than 2px from the last point
  L.dragShape(shape, 10, 10, 30, 20);
  assert.strictEqual(shape.points.length, 3);
});

test('isDegenerate spots a click that drew nothing', () => {
  const rect = L.createShape('rect', 5, 5, {});
  assert.ok(L.isDegenerate(rect));
  L.dragShape(rect, 5, 5, 50, 50);
  assert.ok(!L.isDegenerate(rect));

  const pen = L.createShape('pen', 5, 5, {});
  assert.ok(L.isDegenerate(pen));
});

test('shapeBBox normalizes negative line extents', () => {
  const shape = L.createShape('arrow', 100, 100, {});
  L.dragShape(shape, 100, 100, 40, 160);
  assert.deepStrictEqual(L.shapeBBox(shape), { x: 40, y: 100, w: 60, h: 60 });
});

test('moveShape shifts pen points', () => {
  const shape = L.createShape('pen', 0, 0, {});
  L.dragShape(shape, 0, 0, 10, 10);
  L.moveShape(shape, 5, -5);
  assert.deepStrictEqual(shape.points, [
    [5, -5],
    [15, 5],
  ]);
});

test('resizeShape se handle grows the box from a frozen start', () => {
  const shape = L.createShape('rect', 10, 10, {});
  L.dragShape(shape, 10, 10, 110, 60);
  const from = structuredClone(shape);
  L.resizeShape(shape, from, 'se', 40, 20);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 10, y: 10, w: 140, h: 70 }
  );
});

test('resizeShape clamps below the minimum size', () => {
  const shape = L.createShape('rect', 10, 10, {});
  L.dragShape(shape, 10, 10, 110, 60);
  const from = structuredClone(shape);
  L.resizeShape(shape, from, 'se', -500, -500);
  assert.ok(shape.w >= 8 && shape.h >= 8);
});

test('resizeShape moves a line endpoint', () => {
  const shape = L.createShape('line', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 50);
  const from = structuredClone(shape);
  L.resizeShape(shape, from, 'start', 10, 20);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 10, y: 20, w: 90, h: 30 }
  );
});

test('resizeShape scales pen points with the box', () => {
  const shape = L.createShape('pen', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 100);
  const from = structuredClone(shape);
  L.resizeShape(shape, from, 'se', 100, 100); // double both extents
  assert.deepStrictEqual(shape.points[1], [200, 200]);
});

test('addSlide inserts after the current one', () => {
  const deck = L.createDeck();
  deck.slides[0].shapes.push(L.createShape('rect', 0, 0, {}));
  const at = L.addSlide(deck, 0);
  assert.strictEqual(at, 1);
  assert.strictEqual(deck.slides.length, 2);
  assert.strictEqual(deck.slides[1].shapes.length, 0);
});

test('deleteSlide never leaves an empty deck', () => {
  const deck = L.createDeck();
  const at = L.deleteSlide(deck, 0);
  assert.strictEqual(at, 0);
  assert.strictEqual(deck.slides.length, 1);
});

test('renderShapeSvg escapes text content', () => {
  const shape = L.createShape('text', 0, 0, {});
  shape.text = 'a <b> & "c"';
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('a &lt;b&gt; &amp; &quot;c&quot;'));
  assert.ok(!svg.includes('<b>'));
});

test('renderShapeSvg draws an arrow head polygon', () => {
  const shape = L.createShape('arrow', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 0);
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<polygon'));
  assert.ok(svg.includes('100,0'));
});

test('renderShapeSvg applies dash styles', () => {
  const shape = L.createShape('rect', 0, 0, { dash: 'dash', strokeWidth: 2 });
  L.dragShape(shape, 0, 0, 50, 50);
  assert.ok(L.renderShapeSvg(shape).includes('stroke-dasharray="6 4"'));
});

test('renderSlideSvg is a standalone svg with a white background', () => {
  const slide = L.createSlide();
  const svg = L.renderSlideSvg(slide);
  assert.ok(svg.startsWith('<svg xmlns='));
  assert.ok(svg.includes('fill="#ffffff"'));
});
