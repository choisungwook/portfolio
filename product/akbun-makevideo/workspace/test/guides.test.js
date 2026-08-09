'use strict';

const test = require('node:test');
const assert = require('node:assert');
const G = require('../src/guides.js');

test('guides stay hidden until one display option is enabled', () => {
  assert.strictEqual(G.visible({}), false);
  assert.strictEqual(G.visible({ showCenterLines: true }), true);
});

test('safe areas use the documented frame percentages', () => {
  const guides = G.lines({ showActionSafeArea: true, showTitleSafeArea: true }, 1920, 1080);
  assert.strictEqual(guides[0].kind, 'action');
  assert.ok(Math.abs(guides[0].x - 67.2) < 0.001);
  assert.ok(Math.abs(guides[0].y - 37.8) < 0.001);
  assert.ok(Math.abs(guides[0].width - 1785.6) < 0.001);
  assert.ok(Math.abs(guides[0].height - 1004.4) < 0.001);
  assert.deepStrictEqual(guides[1], { kind: 'title', x: 96, y: 54, width: 1728, height: 972 });
});

test('rule of thirds and centre lines follow the displayed frame', () => {
  const guides = G.lines({ showRuleOfThirds: true, showCenterLines: true }, 900, 600);
  assert.deepStrictEqual(guides, [
    { kind: 'third', x1: 300, y1: 0, x2: 300, y2: 600 },
    { kind: 'third', x1: 600, y1: 0, x2: 600, y2: 600 },
    { kind: 'third', x1: 0, y1: 200, x2: 900, y2: 200 },
    { kind: 'third', x1: 0, y1: 400, x2: 900, y2: 400 },
    { kind: 'center', x1: 450, y1: 0, x2: 450, y2: 600 },
    { kind: 'center', x1: 0, y1: 300, x2: 900, y2: 300 },
  ]);
});
