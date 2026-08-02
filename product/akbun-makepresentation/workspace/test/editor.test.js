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

test('dragShape with Shift makes a rect square from any corner', () => {
  const shape = L.createShape('rect', 100, 100, {});
  L.dragShape(shape, 100, 100, 160, 200, true);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 100, y: 100, w: 100, h: 100 }
  );

  const up = L.createShape('ellipse', 100, 100, {});
  L.dragShape(up, 100, 100, 40, 20, true);
  assert.deepStrictEqual(
    { x: up.x, y: up.y, w: up.w, h: up.h },
    { x: 20, y: 20, w: 80, h: 80 }
  );
});

test('dragShape with Shift snaps a line to 45 degrees', () => {
  const flat = L.createShape('line', 0, 0, {});
  L.dragShape(flat, 0, 0, 200, 12, true);
  assert.deepStrictEqual({ w: flat.w, h: flat.h }, { w: 200.36, h: 0 });

  const diagonal = L.createShape('arrow', 0, 0, {});
  L.dragShape(diagonal, 0, 0, 100, 90, true);
  assert.strictEqual(diagonal.w, diagonal.h);

  const vertical = L.createShape('line', 0, 0, {});
  L.dragShape(vertical, 0, 0, -8, -150, true);
  assert.strictEqual(vertical.w, 0);
  assert.ok(vertical.h < 0);
});

test('dragShape without Shift is unchanged', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 60, 20, false);
  assert.deepStrictEqual({ w: shape.w, h: shape.h }, { w: 60, h: 20 });
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

test('duplicateSlide inserts an independent copy right after', () => {
  const deck = L.createDeck();
  deck.slides[0].shapes.push(L.createShape('rect', 10, 10, {}));
  const at = L.duplicateSlide(deck, 0);
  assert.strictEqual(at, 1);
  assert.strictEqual(deck.slides.length, 2);
  deck.slides[1].shapes[0].x = 999;
  assert.strictEqual(deck.slides[0].shapes[0].x, 10);
});

test('slideNumberShape is a text shape carrying the number', () => {
  const shape = L.slideNumberShape(7);
  assert.strictEqual(shape.kind, 'text');
  assert.strictEqual(shape.text, '7');
  assert.ok(shape.x > L.SLIDE_W / 2 && shape.y > L.SLIDE_H / 2);
});

test('renderSlideSvg draws the number only when asked', () => {
  const slide = L.createSlide();
  assert.ok(!L.renderSlideSvg(slide).includes('>3<'));
  assert.ok(L.renderSlideSvg(slide, { number: 3 }).includes('>3<'));
});

test('renderShapeSvg uses the shape font family with a fallback', () => {
  const shape = L.createShape('text', 0, 0, { fontFamily: 'Georgia' });
  shape.text = 'hi';
  assert.ok(L.renderShapeSvg(shape).includes('font-family="Georgia, sans-serif"'));

  const fallback = L.createShape('text', 0, 0, {});
  fallback.text = 'hi';
  assert.ok(L.renderShapeSvg(fallback).includes('font-family="Helvetica, sans-serif"'));
});

test('renderShapeSvg draws an imported picture as an image element', () => {
  const shape = {
    kind: 'image',
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    src: 'data:image/png;base64,AAAA',
  };
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<image '));
  assert.ok(svg.includes('href="data:image/png;base64,AAAA"'));
  assert.ok(svg.includes('x="10"') && svg.includes('width="100"'));
});

test('renderShapeSvg renders only inline images, never a remote or crafted src', () => {
  const at = (src) => {
    const svg = L.renderShapeSvg({ kind: 'image', x: 0, y: 0, w: 10, h: 10, src });
    return svg.match(/href="([^"]*)"/)[1];
  };
  assert.equal(at('https://example.com/track.png'), '');
  assert.equal(at('javascript:alert(1)'), '');
  assert.equal(at(''), '');
  // A quote in the value must not be able to close the attribute.
  assert.equal(at('data:image/png;base64,A"/><script>x</script>'), 'data:image/png;base64,A&quot;/&gt;&lt;script&gt;x&lt;/script&gt;');
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

test('renderShapeSvg embeds and crops imported images', () => {
  const shape = L.createShape('image', 10, 20, {});
  shape.w = 300;
  shape.h = 200;
  shape.src = 'data:image/png;base64,abc';
  shape.cropLeft = 0.1;
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<image'));
  assert.ok(svg.includes('href="data:image/png;base64,abc"'));
  assert.ok(svg.includes('viewBox="0.1 0 0.9 1"'));
});

test('wrapTextLines wraps at word boundaries', () => {
  assert.deepStrictEqual(L.wrapTextLines('one two three', 45, 20), [
    'one',
    'two',
    'three',
  ]);
});

test('renderSlideSvg is a standalone svg with a white background', () => {
  const slide = L.createSlide();
  const svg = L.renderSlideSvg(slide);
  assert.ok(svg.startsWith('<svg xmlns='));
  assert.ok(svg.includes('fill="#ffffff"'));
});
