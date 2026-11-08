'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { BACKGROUNDS, ALIGNS, DEFAULTS, find, layout, cssBackground } = require('../src/background');

const options = (overrides) => ({ ...DEFAULTS, background: 'g1', ...overrides });

test('there are twenty backgrounds with unique ids', () => {
  assert.strictEqual(BACKGROUNDS.length, 20);
  assert.strictEqual(new Set(BACKGROUNDS.map((bg) => bg.id)).size, 20);
  assert.strictEqual(find('none'), null);
});

test('nine alignments in a 3 by 3 grid', () => {
  assert.strictEqual(ALIGNS.length, 9);
  assert.deepStrictEqual(ALIGNS[4], ['center', 0.5, 0.5]);
});

// Padding is in points, so a retina capture gets twice the pixels.
test('ratio auto pads evenly and scales padding by the display scale', () => {
  assert.deepStrictEqual(layout(400, 200, options({ padding: 50, radius: 10 }), 2), {
    width: 600,
    height: 400,
    x: 100,
    y: 100,
    radius: 20,
    padding: 100,
  });
});

test('a ratio widens the frame and the alignment places the image in it', () => {
  // 200x200 plus 2 x 20 padding is 240 square; 16:9 makes it 427 wide.
  const centred = layout(200, 200, options({ padding: 20, ratio: '16:9' }), 1);
  assert.strictEqual(centred.width, 427);
  assert.strictEqual(centred.height, 240);
  assert.strictEqual(centred.x, 20 + Math.round(187 / 2));
  assert.strictEqual(layout(200, 200, options({ padding: 20, ratio: '16:9', align: 'left' }), 1).x, 20);
  assert.strictEqual(layout(200, 200, options({ padding: 20, ratio: '16:9', align: 'right' }), 1).x, 207);
});

test('a tall image under a wide ratio grows height instead', () => {
  const box = layout(400, 100, options({ padding: 0, ratio: '1:1', align: 'bottom' }), 1);
  assert.deepStrictEqual([box.width, box.height, box.x, box.y], [400, 400, 0, 300]);
});

test('the corner radius never exceeds half the short side', () => {
  assert.strictEqual(layout(40, 20, options({ radius: 100 }), 1).radius, 10);
});

test('swatch css matches the backdrop kind', () => {
  assert.strictEqual(cssBackground(find('s1')), '#ffffff');
  assert.strictEqual(cssBackground(find('g2')), 'linear-gradient(135deg, #2193b0, #6dd5ed)');
});
