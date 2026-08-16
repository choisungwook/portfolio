'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/editor.js');
const S = require('../src/settings.js');

test('settings use the smaller guideline margins by default', () => {
  const settings = S.defaultAppSettings();
  assert.deepStrictEqual(settings.guidelines, {
    visible: false,
    unit: 'px',
    top: 36,
    bottom: 48,
    left: 48,
    right: 48,
  });
  const geometry = S.guidelineGeometry(1920, 1080, settings.guidelines);
  assert.strictEqual(geometry.x, 48);
  assert.strictEqual(geometry.width, 1824);
  assert.strictEqual(geometry.titleY, 36);
  assert.strictEqual(geometry.contentY + geometry.contentHeight, 1032);
});

test('settings normalize guidelines and custom presets', () => {
  const shape = L.createShape('rect', 10, 20, {});
  shape.w = 100;
  shape.h = 80;
  const settings = S.normalizeAppSettings({
    version: 99,
    guidelines: {
      visible: true,
      unit: 'cm',
      top: 10,
      bottom: -1,
      left: 20,
      right: 'bad',
    },
    customPresets: [
      { id: 'rectangle', name: 'Rectangle', shapes: [shape] },
      { id: 'rectangle', name: 'Duplicate', shapes: [shape] },
    ],
  });
  assert.strictEqual(settings.version, S.SETTINGS_VERSION);
  assert.deepStrictEqual(settings.guidelines, {
    visible: true,
    unit: 'cm',
    top: 10,
    bottom: 48,
    left: 20,
    right: 48,
  });
  assert.strictEqual(settings.customPresets.length, 1);
  assert.strictEqual(settings.customPresets[0].id, 'rectangle');
});

test('guideline margins must leave drawable slide space', () => {
  assert.ok(S.guidelineMarginsFit(1920, 1080, {
    top: 36,
    bottom: 48,
    left: 48,
    right: 48,
  }));
  assert.ok(!S.guidelineMarginsFit(100, 100, {
    top: 50,
    bottom: 50,
    left: 0,
    right: 0,
  }));
});
