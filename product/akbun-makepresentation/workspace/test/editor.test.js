'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/editor.js');

test('createDeck starts with one empty slide', () => {
  const deck = L.createDeck();
  assert.strictEqual(deck.slides.length, 1);
  assert.deepStrictEqual(deck.slides[0].shapes, []);
  assert.deepStrictEqual(L.slideSize(deck), { width: 1920, height: 1080 });
});

test('slide size supports presets, custom pixels, and centimeters', () => {
  const deck = L.createDeck();
  assert.deepStrictEqual(L.slideSizePreset('16:9'), { width: 1920, height: 1080 });
  assert.deepStrictEqual(L.slideSizePreset('4:3'), { width: 1440, height: 1080 });
  assert.deepStrictEqual(L.slideSizePreset('3:4'), { width: 1080, height: 1440 });
  assert.deepStrictEqual(L.slideSizePreset('9:16'), { width: 1080, height: 1920 });
  assert.strictEqual(L.slideSizePreset('custom'), null);
  assert.strictEqual(L.pixelsToCentimeters(960), 25.4);
  assert.strictEqual(L.centimetersToPixels(25.4), 960);
  assert.strictEqual(L.centimetersToPixels(33.867), 1280);
  assert.ok(L.setSlideSize(deck, 1000, 1000));
  assert.deepStrictEqual(L.slideSize(deck), { width: 1000, height: 1000 });
  assert.ok(!L.setSlideSize(deck, 0, 1000));
  assert.deepStrictEqual(L.slideSize({ slides: [] }), { width: 1920, height: 1080 });
});

test('renderSlideSvg uses the requested slide dimensions', () => {
  const svg = L.renderSlideSvg(L.createSlide(), { width: 720, height: 1280, number: 2 });
  assert.ok(svg.includes('viewBox="0 0 720 1280"'));
  assert.ok(svg.includes('<rect width="720" height="1280"'));
  assert.ok(svg.includes('>2<'));
});

test('new shapes use a red stroke and text keeps a dark text color', () => {
  const rect = L.createShape('rect', 0, 0, {});
  const text = L.createShape('text', 0, 0, {});
  assert.strictEqual(rect.stroke, '#e03131');
  assert.strictEqual(text.textColor, '#1a1a1a');
});

test('parseClipboardShapes normalizes valid shapes with safe defaults', () => {
  const rect = L.createShape('rect', 10, 20, { fill: '#abcdef' });
  rect.w = 100;
  rect.h = 80;
  const [parsed] = L.parseClipboardShapes(JSON.stringify([rect]));
  assert.deepStrictEqual(
    { kind: parsed.kind, x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h, fill: parsed.fill },
    { kind: 'rect', x: 10, y: 20, w: 100, h: 80, fill: '#abcdef' }
  );
});

test('parseClipboardShapes rejects malformed geometry and pen points', () => {
  const malformed = [
    { kind: 'rect', x: '10', y: 20, w: 100, h: 80 },
    { kind: 'pen', x: 0, y: 0, w: 10, h: 10 },
    { kind: 'pen', x: 0, y: 0, w: 10, h: 10, points: [[0, 0], [NaN, 10]] },
  ];
  assert.deepStrictEqual(L.parseClipboardShapes(JSON.stringify(malformed)), []);
});

test('parseClipboardShapes rejects an excessive object count', () => {
  const shape = L.createShape('rect', 0, 0, {});
  assert.deepStrictEqual(L.parseClipboardShapes(JSON.stringify(Array(101).fill(shape))), []);
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

test('shapeSelectionContainsPoint follows rotated rectangles', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 20);
  shape.rotation = 90;
  assert.ok(L.shapeSelectionContainsPoint(shape, 50, 40));
  assert.ok(!L.shapeSelectionContainsPoint(shape, 90, 10));
});

test('shapeSelectionContainsPoint excludes ellipse corners', () => {
  const shape = L.createShape('ellipse', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 50);
  assert.ok(L.shapeSelectionContainsPoint(shape, 50, 25));
  assert.ok(!L.shapeSelectionContainsPoint(shape, 0, 0));
});

test('normalizeRect accepts a drag in any direction', () => {
  assert.deepStrictEqual(L.normalizeRect(100, 80, 20, 10), {
    x: 20,
    y: 10,
    w: 80,
    h: 70,
  });
});

test('shapeIndicesInRect selects every shape the area touches', () => {
  const box = L.createShape('rect', 20, 20, {});
  L.dragShape(box, 20, 20, 120, 120);
  const label = L.createShape('text', 40, 60, {});
  L.dragShape(label, 40, 60, 100, 80);
  const far = L.createShape('ellipse', 300, 300, {});
  L.dragShape(far, 300, 300, 340, 340);
  const shapes = [box, label, far];

  // The reported bug. Shapes default to no fill, so a drag begun in the empty
  // middle of the box starts a marquee, and that marquee can never enclose
  // the box it started inside. Under the old containment rule it came back
  // holding the label alone.
  assert.deepStrictEqual(
    L.shapeIndicesInRect(shapes, { x: 30, y: 50, w: 200, h: 200 }),
    [0, 1]
  );

  // Touching is the whole rule. An area that reaches nothing stays empty.
  assert.deepStrictEqual(L.shapeIndicesInRect(shapes, { x: 200, y: 200, w: 10, h: 10 }), []);
});

test('toggleSelection adds and removes one valid object without disturbing others', () => {
  assert.deepStrictEqual(L.toggleSelection([0], 2, 3), [0, 2]);
  assert.deepStrictEqual(L.toggleSelection([0, 2], 0, 3), [2]);
  assert.deepStrictEqual(L.toggleSelection([0, 2], 3, 3), [0, 2]);
  assert.deepStrictEqual(L.toggleSelection([0, 0, 2, -1, 3, 1.5], 1, 3), [0, 2, 1]);
  assert.deepStrictEqual(L.toggleSelection([0, 0, 2, -1, 3, 1.5], 3, 3), [0, 2]);
});

test('grouped objects select, ungroup, and clone independently', () => {
  const shapes = [L.createShape('rect', 0, 0, {}), L.createShape('ellipse', 20, 20, {})];
  const group = L.groupShapes(shapes, [0, 1]);
  assert.ok(group);
  assert.deepStrictEqual(L.groupIndicesFor(shapes, 1), [0, 1]);

  const copies = L.cloneShapes(shapes);
  assert.notStrictEqual(copies[0].groupId, group);
  assert.strictEqual(copies[0].groupId, copies[1].groupId);

  assert.strictEqual(L.ungroupShapes(shapes, [0]), true);
  assert.strictEqual(shapes[0].groupId, '');
  assert.strictEqual(shapes[1].groupId, '');
});

test('setCrop keeps opposing crop values inside the image', () => {
  const image = L.createShape('image', 0, 0, {});
  image.cropRight = 0.4;
  L.setCrop(image, 'left', 0.9);
  assert.strictEqual(image.cropLeft, 0.55);
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

test('resizeShapeConstrained keeps the proportions of a wide rectangle', () => {
  const shape = L.createShape('rect', 10, 20, {});
  L.dragShape(shape, 10, 20, 410, 120); // 400x100, four times as wide as tall
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'se', -200, -20);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 10, y: 20, w: 200, h: 50 }
  );
});

// The bug this replaces: Shift used to turn the box into a square, so
// shrinking a 400x100 rectangle by 200px grew it to 200x200.
test('resizeShapeConstrained shrinking a wide box never makes it taller', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 400, 100);
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'se', -200, -50);
  assert.ok(shape.h < from.h, `height ${shape.h} should be under ${from.h}`);
});

test('resizeShapeConstrained keeps an ellipse proportional from the far corner', () => {
  const shape = L.createShape('ellipse', 10, 20, {});
  L.dragShape(shape, 10, 20, 110, 70); // 100x50
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'nw', -40, 0);
  // The south east corner stays put, so growing 40 wider grows 20 taller.
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: -30, y: 0, w: 140, h: 70 }
  );
});

test('resizeShapeConstrained scales pen points proportionally', () => {
  const shape = L.createShape('pen', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 50);
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'se', 100, 0);
  assert.deepStrictEqual(shape.points[1], [200, 100]);
});

test('resizeShapeConstrained keeps a line on its original axis', () => {
  const shape = L.createShape('line', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 50);
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'end', -40, 70);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 0, y: 0, w: 96, h: 48 }
  );
});

test('resizeShapeConstrained reverses a one-way arrow across its fixed endpoint', () => {
  const shape = L.createShape('arrow', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 0);
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'end', -220, 15);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h, arrowEnd: shape.arrowEnd },
    { x: 0, y: 0, w: -120, h: 0, arrowEnd: 'triangle' }
  );
});

test('resizeShapeConstrained reverses a line dragged past its end from the start handle', () => {
  const shape = L.createShape('line', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 0);
  const from = structuredClone(shape);
  L.resizeShapeConstrained(shape, from, 'start', 150, 20);
  assert.deepStrictEqual(
    { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    { x: 150, y: 0, w: -50, h: 0 }
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

test('renderShapesSvg crops selected shapes without a slide background', () => {
  const shape = L.createShape('rect', 100, 200, { fill: '#abcdef', strokeWidth: 4 });
  shape.w = 300;
  shape.h = 100;
  const image = L.renderShapesSvg([shape]);
  assert.ok(image.svg.includes('viewBox="98 198 304 104"'));
  assert.ok(image.svg.includes('fill="#abcdef"'));
  assert.ok(!image.svg.includes(`width="${L.SLIDE_W}"`));
  assert.strictEqual(image.width, 304);
  assert.strictEqual(image.height, 104);
});

test('renderShapesSvg expands the crop for a rotated shape', () => {
  const shape = L.createShape('text', 100, 100, {});
  shape.w = 200;
  shape.h = 50;
  shape.text = 'title';
  shape.rotation = 90;
  const image = L.renderShapesSvg([shape]);
  assert.ok(image.width < image.height);
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

// Round and square both run half a stroke past the endpoint, which on an arrow
// reads as a bead stuck on the end. Only butt stops on it. Asking for the cap
// rather than for the attribute lets an explicit butt pass. Lines and pen
// strokes keep their round cap.
test('renderShapeSvg gives the arrow shaft a butt cap at both ends', () => {
  const shape = L.createShape('arrow', 0, 0, { strokeWidth: 8 });
  L.dragShape(shape, 0, 0, 100, 0);
  const cap = L.renderShapeSvg(shape).match(/stroke-linecap="(\w+)"/);
  assert.strictEqual(cap ? cap[1] : 'butt', 'butt');

  const line = L.createShape('line', 0, 0, {});
  L.dragShape(line, 0, 0, 100, 0);
  assert.ok(L.renderShapeSvg(line).includes('stroke-linecap="round"'));
});

// The head used to keep its full length on a short arrow, which pushed the
// shaft backwards and left its far end sitting behind the tail as a dot.
test('renderShapeSvg keeps a short arrow inside its own span', () => {
  const shape = L.createShape('arrow', 20, 20, { strokeWidth: 6 });
  L.dragShape(shape, 20, 20, 32, 20);
  const svg = L.renderShapeSvg(shape);
  const shaftEnd = Number(svg.match(/x2="([\d.]+)"/)[1]);
  assert.ok(shaftEnd >= 20 && shaftEnd <= 32);
});

test('renderShapeSvg draws nothing for a zero length arrow', () => {
  const shape = L.createShape('arrow', 40, 40, {});
  assert.strictEqual(L.renderShapeSvg(shape), '');
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

test('renderShapeSvg draws an image border and a freehand end arrow', () => {
  const image = L.createShape('image', 10, 20, { stroke: '#1971c2', strokeWidth: 3 });
  image.w = 300;
  image.h = 200;
  assert.ok(L.renderShapeSvg(image).includes('stroke="#1971c2"'));

  const pen = L.createShape('pen', 0, 0, {});
  L.dragShape(pen, 0, 0, 100, 20);
  pen.arrowEnd = 'triangle';
  assert.ok(L.renderShapeSvg(pen).includes('<polygon'));
});

test('renderShapeSvg gives a freehand stroke the same five ends a line has', () => {
  const pen = L.createShape('pen', 0, 0, {});
  L.dragShape(pen, 0, 0, 100, 0);
  assert.ok(!L.renderShapeSvg(pen).includes('<circle'));
  pen.arrowStart = 'oval';
  pen.arrowEnd = 'diamond';
  const svg = L.renderShapeSvg(pen);
  assert.ok(svg.includes('<circle'), 'start oval');
  assert.ok(svg.includes('<polygon'), 'end diamond');
});

test('parseClipboardShapes reads the old freehand arrow flag as an end', () => {
  const [pen] = L.parseClipboardShapes(
    JSON.stringify([{ kind: 'pen', x: 0, y: 0, w: 0, h: 0, points: [[0, 0], [10, 0]], penArrow: true }])
  );
  assert.strictEqual(pen.arrowEnd, 'triangle');
});

test('rotationTowards answers the angle from the box centre, snapping with Shift', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 100, 100);
  // Straight up from the centre is the grip at rest.
  assert.strictEqual(L.rotationTowards(shape, 50, -50, false), 0);
  assert.strictEqual(L.rotationTowards(shape, 150, 50, false), 90);
  assert.strictEqual(L.rotationTowards(shape, 50, 150, false), 180);
  // Just off a quarter turn, snapped to it.
  assert.strictEqual(L.rotationTowards(shape, 150, 60, true), 90);
  assert.strictEqual(L.rotationTowards(shape, 60, -50, true), 0);
});

test('rotationHandleFor sits above the middle of the box', () => {
  const shape = L.createShape('rect', 40, 80, {});
  L.dragShape(shape, 40, 80, 140, 180);
  const grip = L.rotationHandleFor(shape);
  assert.strictEqual(grip.x, 90);
  assert.ok(grip.y < 80, 'above the top edge');
});

test('renderShapeSvg rotates a line, an arrow and a freehand stroke', () => {
  for (const kind of ['line', 'arrow', 'pen']) {
    const shape = L.createShape(kind, 0, 0, {});
    L.dragShape(shape, 0, 0, 100, 40);
    shape.rotation = 30;
    assert.ok(L.renderShapeSvg(shape).includes('rotate(30'), kind);
  }
});

test('wrapTextLines wraps words and splits one wider than the box', () => {
  assert.deepStrictEqual(L.wrapTextLines('one two three', 45, 20), [
    'one',
    'two',
    'thre',
    'e',
  ]);
});

test('renderSlideSvg is a standalone svg with a white background', () => {
  const slide = L.createSlide();
  const svg = L.renderSlideSvg(slide);
  assert.ok(svg.startsWith('<svg xmlns='));
  assert.ok(svg.includes('fill="#ffffff"'));
});

test('renderSlideSvg paints the slide background and leaves shapes alone', () => {
  const slide = L.createSlide();
  const shape = L.createShape('rect', 10, 10, { fill: '#ffd43b' });
  L.dragShape(shape, 10, 10, 100, 100);
  slide.shapes.push(shape);
  slide.background = '#212022';

  const svg = L.renderSlideSvg(slide);
  assert.ok(svg.includes(`<rect width="1920" height="1080" fill="#212022"/>`));
  assert.ok(svg.includes('fill="#ffd43b"'));
});

test('slideBackground falls back to white for a slide saved without one', () => {
  assert.strictEqual(L.slideBackground({ shapes: [] }), '#ffffff');
  assert.strictEqual(L.slideBackground({ shapes: [], background: 'none' }), '#ffffff');
  assert.strictEqual(L.slideBackground({ shapes: [], background: '#212022' }), '#212022');
});

test('createShape carries the text style defaults it is handed', () => {
  const shape = L.createShape('text', 0, 0, { bold: true, underline: true, textAlign: 'center' });
  assert.deepStrictEqual(
    { bold: shape.bold, italic: shape.italic, underline: shape.underline, align: shape.textAlign },
    { bold: true, italic: false, underline: true, align: 'center' }
  );
});

test('renderShapeSvg marks up bold, italic and underlined text', () => {
  const shape = L.createShape('text', 0, 0, { bold: true, italic: true, underline: true });
  shape.text = 'hi';
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('font-weight="700"'));
  assert.ok(svg.includes('font-style="italic"'));
  assert.ok(svg.includes('text-decoration="underline"'));

  const plain = L.createShape('text', 0, 0, {});
  plain.text = 'hi';
  assert.ok(!L.renderShapeSvg(plain).includes('text-decoration'));
});

test('zoomIn and zoomOut walk the steps and stop at the ends', () => {
  assert.strictEqual(L.zoomIn(1), 1.25);
  assert.strictEqual(L.zoomOut(1), 0.75);
  assert.strictEqual(L.zoomIn(L.ZOOM_STEPS[L.ZOOM_STEPS.length - 1]), 4);
  assert.strictEqual(L.zoomOut(L.ZOOM_STEPS[0]), 0.5);
  // A factor between two steps snaps to the neighbour in that direction.
  assert.strictEqual(L.zoomIn(1.1), 1.25);
  assert.strictEqual(L.zoomOut(1.1), 1);
});

test('filterFonts searches installed family names without case sensitivity', () => {
  const fonts = ['Apple SD Gothic Neo', 'Helvetica', 'Nanum Gothic'];
  assert.deepStrictEqual(L.filterFonts(fonts, 'GOTHIC'), [
    'Apple SD Gothic Neo',
    'Nanum Gothic',
  ]);
  assert.deepStrictEqual(L.filterFonts(fonts, ''), fonts);
});

// --- arrow ends ---------------------------------------------------------

test('an arrow starts with a head and a line starts bare', () => {
  assert.strictEqual(L.createShape('arrow', 0, 0, {}).arrowEnd, 'triangle');
  assert.strictEqual(L.createShape('arrow', 0, 0, {}).arrowStart, 'none');
  assert.strictEqual(L.createShape('line', 0, 0, {}).arrowEnd, 'none');
});

test('renderShapeSvg draws the end each side asks for', () => {
  const shape = L.createShape('line', 0, 0, {});
  L.dragShape(shape, 0, 0, 200, 0);
  shape.arrowStart = 'oval';
  shape.arrowEnd = 'diamond';
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<circle'), 'the circle end');
  // The diamond is the only polygon here, and it has four corners.
  const diamond = svg.match(/<polygon points="([^"]+)"/);
  assert.ok(diamond, 'the diamond end');
  assert.strictEqual(diamond[1].trim().split(/\s+/).length, 4);
});

test('an open arrow end is stroked, not filled', () => {
  const shape = L.createShape('arrow', 0, 0, {});
  L.dragShape(shape, 0, 0, 200, 0);
  shape.arrowEnd = 'arrow';
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<polyline'));
  assert.ok(!svg.includes('<polygon'));
});

test('an unknown end name draws nothing rather than throwing', () => {
  const shape = L.createShape('arrow', 0, 0, {});
  L.dragShape(shape, 0, 0, 200, 0);
  shape.arrowEnd = 'javascript:alert(1)';
  const svg = L.renderShapeSvg(shape);
  assert.ok(!svg.includes('alert'));
  assert.ok(svg.includes('<line'));
});

// Two ends both clamped to half the line would meet in the middle and the
// shaft would be drawn backwards.
test('two ends together never take more than half a short line', () => {
  const shape = L.createShape('arrow', 0, 0, { strokeWidth: 20 });
  L.dragShape(shape, 0, 0, 40, 0);
  shape.arrowStart = 'triangle';
  const [, x1, x2] = L.renderShapeSvg(shape).match(/<line x1="([\d.]+)"[^>]*x2="([\d.]+)"/);
  assert.ok(Number(x2) - Number(x1) >= 20 - 0.001, `shaft ${x1}..${x2}`);
});

test('parseClipboardShapes keeps known arrow ends and drops the rest', () => {
  const [good] = L.parseClipboardShapes(JSON.stringify([
    { kind: 'arrow', x: 0, y: 0, w: 10, h: 10, arrowStart: 'diamond', arrowEnd: 'nope' },
  ]));
  assert.strictEqual(good.arrowStart, 'diamond');
  assert.strictEqual(good.arrowEnd, 'triangle');
});

// --- text inside a shape ------------------------------------------------

test('a rect and an ellipse center the text they are given', () => {
  const rect = L.createShape('rect', 0, 0, {});
  assert.strictEqual(rect.textAlign, 'center');
  assert.strictEqual(rect.verticalAlign, 'center');
  // A text box is its own box and keeps the top-left start.
  const text = L.createShape('text', 0, 0, {});
  assert.strictEqual(text.textAlign, 'left');
  assert.strictEqual(text.verticalAlign, 'top');
});

test('renderShapeSvg draws a rect and its text, and the outline alone when hidden', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 200, 100);
  shape.text = 'in the box';
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.includes('in the box'));
  assert.ok(!L.renderShapeSvg(shape, { hideText: true }).includes('in the box'));
});

test('fitTextBox grows with text and wraps after its width limit', () => {
  const shape = L.createShape('text', 0, 0, {});
  L.fitTextBox(shape, 'short');
  const shortWidth = shape.w;

  L.fitTextBox(shape, 'a longer line of text');
  assert.ok(shape.w > shortWidth);

  L.fitTextBox(shape, 'word '.repeat(40), 160);
  assert.strictEqual(shape.w, 160);
  assert.ok(shape.h > shape.fontSize * 1.4);

  L.fitTextBox(shape, 'near the edge', 50);
  assert.strictEqual(shape.w, 50);
});

test('default presets provide the requested red shapes and directions', () => {
  const filled = L.defaultPresetShapes('red-filled-rectangle')[0];
  const outline = L.defaultPresetShapes('red-outline-rectangle')[0];
  const numbered = L.defaultPresetShapes('numbered-circle')[0];
  const right = L.defaultPresetShapes('right-open-arrow')[0];
  const left = L.defaultPresetShapes('left-open-arrow')[0];

  assert.strictEqual(filled.fill, '#e03131');
  assert.strictEqual(outline.fill, 'none');
  assert.strictEqual(numbered.text, '1');
  assert.strictEqual(numbered.w, numbered.h);
  assert.strictEqual(right.arrowEnd, 'arrow');
  assert.ok(right.w > 0);
  assert.ok(left.w < 0);
});

test('custom presets accept one non-image shape and normalize its position', () => {
  const shape = L.createShape('rect', 120, 80, {});
  L.dragShape(shape, 120, 80, 280, 170);
  shape.groupId = 'old-group';
  const preset = L.customPresetFromSelection(
    [shape],
    [{ name: 'Rectangle 1' }],
    'custom-1'
  );

  assert.strictEqual(preset.name, 'Rectangle 2');
  assert.strictEqual(preset.shapes.length, 1);
  assert.strictEqual(preset.shapes[0].x, 0);
  assert.strictEqual(preset.shapes[0].y, 0);
  assert.ok(!('groupId' in preset.shapes[0]));
  assert.strictEqual(shape.x, 120);
});

test('custom presets reject multiple shapes and images', () => {
  const first = L.createShape('rect', 0, 0, {});
  const second = L.createShape('ellipse', 0, 0, {});
  const image = L.createShape('image', 0, 0, {});

  assert.strictEqual(L.customPresetFromSelection([first, second], [], 'many'), null);
  assert.strictEqual(L.customPresetFromSelection([image], [], 'image'), null);
});

test('an empty rect draws no text element at all', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 200, 100);
  assert.ok(!L.renderShapeSvg(shape).includes('<text'));
});

test('text inside a shape keeps off the outline, a text box does not', () => {
  const rect = L.createShape('rect', 0, 0, {});
  L.dragShape(rect, 0, 0, 200, 100);
  const box = L.textBox(rect);
  assert.strictEqual(box.x, 8);
  assert.strictEqual(box.w, 184);

  const text = L.createShape('text', 0, 0, {});
  L.dragShape(text, 0, 0, 200, 100);
  assert.strictEqual(L.textBox(text).x, 0);
});

// A shape too small to hold the padding would otherwise get a negative box.
test('the text box of a tiny shape never goes negative', () => {
  const shape = L.createShape('rect', 0, 0, {});
  L.dragShape(shape, 0, 0, 10, 6);
  const box = L.textBox(shape);
  assert.ok(box.w >= 0 && box.h >= 0, JSON.stringify(box));
});

// --- slide order ---------------------------------------------------------

test('moveSlide moves a slide and answers where it landed', () => {
  const deck = { slides: [{ id: 0 }, { id: 1 }, { id: 2 }] };
  assert.strictEqual(L.moveSlide(deck, 0, 2), 2);
  assert.deepStrictEqual(deck.slides.map((s) => s.id), [1, 2, 0]);
  assert.strictEqual(L.moveSlide(deck, 2, 0), 0);
  assert.deepStrictEqual(deck.slides.map((s) => s.id), [0, 1, 2]);
});

test('moveSlide clamps past either end instead of losing a slide', () => {
  const deck = { slides: [{ id: 0 }, { id: 1 }] };
  assert.strictEqual(L.moveSlide(deck, 0, -5), 0);
  assert.strictEqual(L.moveSlide(deck, 0, 99), 1);
  assert.deepStrictEqual(deck.slides.map((s) => s.id), [1, 0]);
  assert.strictEqual(deck.slides.length, 2);
});

test('moveSlideSelection moves adjacent selected slides as one block', () => {
  const deck = { slides: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }] };
  const moved = L.moveSlideSelection(deck, [1, 2], -1);

  assert.deepStrictEqual(deck.slides.map((slide) => slide.id), [1, 2, 0, 3]);
  assert.deepStrictEqual(moved, [0, 1]);

  const restored = L.moveSlideSelection(deck, moved, 1);
  assert.deepStrictEqual(deck.slides.map((slide) => slide.id), [0, 1, 2, 3]);
  assert.deepStrictEqual(restored, [1, 2]);
});

test('moveSlide refuses an index that is not on the deck', () => {
  const deck = { slides: [{ id: 0 }, { id: 1 }] };
  assert.strictEqual(L.moveSlide(deck, 7, 0), 7);
  assert.strictEqual(deck.slides.length, 2);
});

test('code blocks render syntax colors, highlighted lines, and numbered callouts', () => {
  const shape = L.createShape('code', 20, 30, { fontSize: 20 });
  shape.w = 700;
  shape.h = 360;
  shape.text = 'def greet(name):\n  return f"Hello, {name}"';
  shape.codeLanguage = 'python';
  shape.codeHighlights = [2];
  shape.codeCallouts = [1, 2];
  const svg = L.renderShapeSvg(shape);
  assert.ok(svg.includes('fill="#ff79c6">def</tspan>'));
  assert.ok(svg.includes('fill="#343746"'));
  assert.ok(svg.includes('>1</text>'));
  assert.ok(svg.includes('>2</text>'));
});

test('code block clipboard data keeps only supported settings and line numbers', () => {
  const [shape] = L.parseClipboardShapes(JSON.stringify([{
    ...L.createShape('code', 10, 20, {}),
    w: 500,
    h: 300,
    text: '<script>alert(1)</script>',
    codeFormat: 'terminal',
    codeLanguage: 'html',
    codeHighlights: [3, -1, 3, 2],
    codeCallouts: '4, 6-7',
    showLineNumbers: false,
  }]));
  assert.equal(shape.kind, 'code');
  assert.equal(shape.codeFormat, 'terminal');
  assert.equal(shape.codeLanguage, 'html');
  assert.deepEqual(shape.codeHighlights, [2, 3]);
  assert.deepEqual(shape.codeCallouts, [4, 6, 7]);
  assert.equal(shape.showLineNumbers, false);
  assert.ok(L.renderShapeSvg(shape).includes('&lt;'));
});
